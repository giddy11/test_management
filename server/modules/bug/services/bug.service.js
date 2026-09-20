// modules/bug/services/bug.service.js
const { BugRepository } = require("../repositories/bug.repository");
const { BugStatusHistoryRepository } = require("../repositories/bugStatusHistory.repository");
const { ProjectService } = require("../../project/services/project.service");
const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { TestCaseRepository } = require("../../testCase/repositories/testCase.repository");
const { TestSuiteRepository } = require("../../testSuite/repositories/testSuite.repository");
const { TestRunRepository } = require("../../testRun/repositories/testRun.repository");
const { NotificationService } = require("../../notification/services/notification.service");
const { ActivityService } = require("../../activity/services/activity.service");
const {
  ProjectMemberRepository,
} = require("../../project/repositories/projectMember.repository");
const { AppError } = require("../../../shared/errors/AppError");
const { parseReferenceCode } = require("../../../shared/utils/referenceCode");
const { UserRole, BugStatus } = require("../../../config/constants");

// PATCH /bugs/:id fields that need manage rights vs. ones the reporter may fix.
const TRIAGE_FIELDS = ["status", "severity", "priority", "assignedToId"];
const CONTENT_FIELDS = [
  "title",
  "description",
  "stepsToReproduce",
  "expectedBehavior",
  "actualBehavior",
  "environment",
  "testCaseId",
];

class BugService {
  static Instance = new BugService();

  constructor(
    bugRepo = BugRepository.Instance,
    projectService = ProjectService.Instance,
    authRepo = AuthRepository.Instance,
    testCaseRepo = TestCaseRepository.Instance,
    testSuiteRepo = TestSuiteRepository.Instance,
    testRunRepo = TestRunRepository.Instance,
    notificationService = NotificationService.Instance,
    memberRepo = ProjectMemberRepository.Instance,
    historyRepo = BugStatusHistoryRepository.Instance
  ) {
    this.bugRepo = bugRepo;
    this.projectService = projectService;
    this.authRepo = authRepo;
    this.testCaseRepo = testCaseRepo;
    this.testSuiteRepo = testSuiteRepo;
    this.testRunRepo = testRunRepo;
    this.notificationService = notificationService;
    this.memberRepo = memberRepo;
    this.historyRepo = historyRepo;
  }

  canManage(actor) {
    return actor.role === UserRole.ADMIN || actor.role === UserRole.SUPERADMIN;
  }

  // Fetches the bug, 404s if missing/deleted, then checks project access —
  // same "check access via parent" pattern as FeatureRequestService.getAccessible.
  async getAccessible(actor, id) {
    const bug = await this.bugRepo.findById(id);
    if (!bug || bug.deletedAt) throw new AppError("Bug not found", 404);
    await this.projectService.getProject(actor, bug.projectId);
    return bug;
  }

  async fetchBugs(actor, params) {
    await this.projectService.getProject(actor, params.projectId);
    return this.bugRepo.fetchPaginated(params);
  }

  async getBug(actor, id) {
    return this.getAccessible(actor, id);
  }

  // Same as getAccessible but resolves via the human-readable reference code
  // (e.g. "BF-014") instead of the uuid — backs the /by-code deep link used
  // by the "share link" button on the bug detail page.
  async getBugByCode(actor, code) {
    const bugNumber = parseReferenceCode("BF", code);
    if (bugNumber == null) throw new AppError("Bug not found", 404);
    const bug = await this.bugRepo.findByNumber(bugNumber);
    if (!bug || bug.deletedAt) throw new AppError("Bug not found", 404);
    await this.projectService.getProject(actor, bug.projectId);
    return bug;
  }

  // Confirms an optional testCaseId/testRunId actually belongs to the same
  // project as the bug — cheap existence + ownership check, same defensive
  // style as ProjectService.resolveMembers.
  async _assertLinksBelongToProject(projectId, { testCaseId, testRunId }) {
    if (testCaseId) {
      const testCase = await this.testCaseRepo.findById(testCaseId);
      if (!testCase) throw new AppError("Related test case not found", 404);
      const suite = await this.testSuiteRepo.findById(testCase.suiteId);
      if (!suite || suite.projectId !== projectId) {
        throw new AppError("Related test case does not belong to this project", 422);
      }
    }
    if (testRunId) {
      const run = await this.testRunRepo.findById(testRunId);
      if (!run || run.projectId !== projectId) {
        throw new AppError("Related test run does not belong to this project", 422);
      }
    }
  }

  async createBug(actor, data) {
    const project = await this.projectService.getProject(actor, data.projectId);
    await this._assertLinksBelongToProject(data.projectId, data);

    const bug = await this.bugRepo.create({
      projectId: data.projectId,
      title: data.title,
      description: data.description,
      stepsToReproduce: data.stepsToReproduce ?? null,
      expectedBehavior: data.expectedBehavior ?? null,
      actualBehavior: data.actualBehavior ?? null,
      environment: data.environment ?? null,
      severity: data.severity,
      priority: data.priority,
      testCaseId: data.testCaseId ?? null,
      testRunId: data.testRunId ?? null,
      reportedById: actor.id,
      status: BugStatus.OPEN,
    });

    // First entry in the SLA "paused time" timeline — same pattern as
    // FeedbackService seeding feedback_status_history on creation.
    this.historyRepo
      .create({ bugId: bug.id, status: BugStatus.OPEN, enteredAt: bug.createdAt })
      .catch((e) => console.error("[bug] history entry failed:", e.message));

    ActivityService.Instance.log(actor, {
      action: "bug.created",
      summary: `Reported bug "${bug.title}" in project "${project.name}"`,
      entityType: "bug",
      entityId: bug.id,
      metadata: { projectId: bug.projectId },
    });

    // Notify the project's own org admins + the project's members — this is
    // company-operational data, so superadmins (platform-wide oversight) are
    // deliberately excluded. The reporter is excluded too; they already know.
    Promise.all([
      project.organizationId
        ? this.authRepo.findByRoleAndOrg(UserRole.ADMIN, project.organizationId)
        : Promise.resolve([]),
      this.authRepo.findUserById(actor.id),
      this.memberRepo.findMemberUsers(bug.projectId),
    ])
      .then(([orgAdmins, reporter, members]) => {
        const recipients = [
          ...new Map(
            [...orgAdmins, ...members]
              .filter((u) => u.id !== actor.id)
              .map((u) => [u.id, u])
          ).values(),
        ];
        if (recipients.length) {
          const reportedByName = reporter
            ? [reporter.firstName, reporter.lastName].filter(Boolean).join(" ")
            : "A user";
          this.notificationService.notifyNewBug(recipients, {
            bugId: bug.id,
            projectId: bug.projectId,
            title: bug.title,
            reportedByName,
            organizationId: project.organizationId,
          });
        }
      })
      .catch((e) => console.error("[bug] new-bug notify failed:", e.message));

    return this.bugRepo.findById(bug.id);
  }

  async manageBug(actor, id, data) {
    const bug = await this.getAccessible(actor, id);

    // Triage fields (status/severity/priority/assignee) are for admins/superadmins
    // and the project's team leads only — severity/priority also drive the SLA
    // targets, so a reporter must not be able to relax their own. Fixing a
    // mistake in the report itself is also open to whoever reported it; a
    // request that mixes both is treated as triage (all-or-nothing).
    const touchesTriage = TRIAGE_FIELDS.some((f) => data[f] !== undefined);
    const isReporter = bug.reportedById === actor.id;
    if (touchesTriage || !isReporter) {
      await this.projectService.assertCanManageProject(actor, bug.projectId);
    }
    if (data.testCaseId) {
      await this._assertLinksBelongToProject(bug.projectId, { testCaseId: data.testCaseId });
    }

    const patch = {};
    if (data.severity !== undefined) patch.severity = data.severity;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.assignedToId !== undefined) patch.assignedToId = data.assignedToId;
    for (const field of CONTENT_FIELDS) {
      if (data[field] !== undefined) patch[field] = data[field];
    }

    const previousStatus = bug.status;
    if (data.status !== undefined) {
      patch.status = data.status;
      patch.statusUpdatedAt = new Date();
      if (!bug.firstResponseAt) {
        patch.firstResponseAt = patch.statusUpdatedAt;
      }
      if (data.status === BugStatus.FIXED && !bug.resolvedAt) {
        patch.resolvedAt = new Date();
      }
      if (data.status === BugStatus.CLOSED) {
        patch.closedAt = new Date();
      }
      if (data.status === BugStatus.REOPENED) {
        patch.resolvedAt = null;
        patch.closedAt = null;
      }
    }

    const updated = await this.bugRepo.update(id, patch);
    const project = await this.projectService.getProject(actor, bug.projectId);

    // One history row per status entered — powers the SLA "paused time"
    // calculation and a timeline, same as FeedbackService.
    if (patch.status && patch.status !== bug.status) {
      this.historyRepo
        .create({ bugId: bug.id, status: patch.status, enteredAt: patch.statusUpdatedAt })
        .catch((e) => console.error("[bug] history entry failed:", e.message));
    }

    ActivityService.Instance.log(actor, {
      action: "bug.updated",
      summary: `Updated bug "${bug.title}" in project "${project.name}"`,
      entityType: "bug",
      entityId: bug.id,
      metadata: { projectId: bug.projectId },
    });

    // Status changes fan out to the reporter + every project member (in-app +
    // email), excluding whoever made the change.
    if (data.status !== undefined && data.status !== previousStatus) {
      Promise.all([
        bug.reportedById ? this.authRepo.findUserById(bug.reportedById) : Promise.resolve(null),
        this.memberRepo.findMemberUsers(bug.projectId),
      ])
        .then(([reporter, members]) => {
          const pool = [...members];
          if (reporter) pool.push(reporter);
          const recipients = [
            ...new Map(pool.filter((u) => u.id !== actor.id).map((u) => [u.id, u])).values(),
          ];
          if (recipients.length) {
            this.notificationService.notifyBugStatusChanged(recipients, {
              bugId: bug.id,
              projectId: bug.projectId,
              title: bug.title,
              status: updated.status,
              reportedById: bug.reportedById,
              organizationId: project.organizationId,
            });
          }
        })
        .catch((e) => console.error("[bug] status notify failed:", e.message));
    }

    if (
      data.assignedToId !== undefined &&
      data.assignedToId &&
      data.assignedToId !== bug.assignedToId &&
      data.assignedToId !== actor.id
    ) {
      this.authRepo
        .findUserById(data.assignedToId)
        .then((assignee) => {
          if (assignee) {
            this.notificationService.notifyBugAssigned(assignee, {
              bugId: bug.id,
              projectId: bug.projectId,
              title: bug.title,
            });
          }
        })
        .catch((e) => console.error("[bug] assign notify failed:", e.message));
    }

    return updated;
  }

  async deleteBug(actor, id) {
    const bug = await this.getAccessible(actor, id);
    await this.projectService.assertCanManageProject(actor, bug.projectId);
    const project = await this.projectService.getProject(actor, bug.projectId);
    await this.bugRepo.softDelete(id);
    ActivityService.Instance.log(actor, {
      action: "bug.deleted",
      summary: `Deleted bug "${bug.title}" in project "${project.name}"`,
      entityType: "bug",
      entityId: bug.id,
      metadata: { projectId: bug.projectId },
    });
  }
}

module.exports = { BugService };
