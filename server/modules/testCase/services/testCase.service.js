// modules/testCase/services/testCase.service.js
const { TestCaseRepository } = require("../repositories/testCase.repository");
const { TestSuiteService } = require("../../testSuite/services/testSuite.service");
const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { NotificationService } = require("../../notification/services/notification.service");
const { ActivityService } = require("../../activity/services/activity.service");
const { AppError } = require("../../../shared/errors/AppError");
const { TestCaseStatus, UserRole } = require("../../../config/constants");

// Human-readable label for an activity summary: names up to 3 users, else a count.
function userLabel(users) {
  const names = users.map(
    (u) => [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || "a user"
  );
  if (names.length === 0) return "no one";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names.length} users`;
}

// `actor` = { id, role, organizationId }.
class TestCaseService {
  static Instance = new TestCaseService();

  constructor(
    tcRepo = TestCaseRepository.Instance,
    suiteService = TestSuiteService.Instance,
    authRepo = AuthRepository.Instance
  ) {
    this.tcRepo = tcRepo;
    this.suiteService = suiteService;
    this.authRepo = authRepo;
  }

  // A plain "user" only sees cases assigned to them; admins/superadmin see all.
  isRestricted(actor) {
    return actor.role === UserRole.USER;
  }

  // Team leads of the suite's project see every case, like admins do.
  async isRestrictedInProject(actor, projectId) {
    if (!this.isRestricted(actor)) return false;
    return !(await this.suiteService.projectService.isTeamLead(actor, projectId));
  }

  async fetchTestCases(actor, params) {
    const suite = await this.suiteService.getTestSuite(actor, params.suite); // org access check
    const restricted = await this.isRestrictedInProject(actor, suite.projectId);
    return this.tcRepo.fetchPaginated({
      ...params,
      suiteId: params.suite,
      assigneeId: restricted ? actor.id : undefined,
    });
  }

  async getTestCase(actor, id) {
    const tc = await this.tcRepo.findById(id);
    if (!tc || tc.deletedAt) {
      throw new AppError("Test case not found", 404);
    }
    const suite = await this.suiteService.getTestSuite(actor, tc.suiteId); // org access check
    const restricted = await this.isRestrictedInProject(actor, suite.projectId);
    if (restricted && !(tc.assignees ?? []).some((u) => u.id === actor.id)) {
      throw new AppError("Test case not found", 404); // hide unassigned cases
    }
    return tc;
  }

  logCaseEvent(actor, action, tc, verb, suite, metadata = {}) {
    ActivityService.Instance.log(actor, {
      action,
      summary: `${verb} test case "${tc.title}"${suite ? ` in suite "${suite.name}"` : ""}`,
      entityType: "test_case",
      entityId: tc.id,
      metadata: { suiteId: tc.suiteId, projectId: suite?.projectId ?? null, ...metadata },
    });
  }

  async createTestCase(actor, data) {
    const suite = await this.suiteService.getTestSuite(actor, data.suite);
    await this.suiteService.projectService.assertCanManageProject(actor, suite.projectId);
    const tc = await this.tcRepo.create({
      title: data.title,
      description: data.description ?? null,
      steps: data.steps,
      expectedResult: data.expectedResult,
      priority: data.priority,
      status: data.status ?? TestCaseStatus.DRAFT,
      suiteId: data.suite,
      tags: data.tags ?? null,
      createdById: actor.id,
    });
    this.logCaseEvent(actor, "test_case.created", tc, "Created", suite);
    return tc;
  }

  async updateTestCase(actor, id, data) {
    const tc = await this.getTestCase(actor, id);
    const suiteForCheck = await this.suiteService.getTestSuite(actor, tc.suiteId);
    await this.suiteService.projectService.assertCanManageProject(actor, suiteForCheck.projectId);

    const patch = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.steps !== undefined) patch.steps = data.steps;
    if (data.expectedResult !== undefined) patch.expectedResult = data.expectedResult;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.status !== undefined) patch.status = data.status;
    if (data.tags !== undefined) patch.tags = data.tags;

    const updated = await this.tcRepo.update(tc.id, patch);
    this.logCaseEvent(actor, "test_case.updated", tc, "Updated", suiteForCheck);
    return updated;
  }

  async deleteTestCase(actor, id) {
    const tc = await this.getTestCase(actor, id);
    const suite = await this.suiteService.getTestSuite(actor, tc.suiteId);
    await this.suiteService.projectService.assertCanManageProject(actor, suite.projectId);
    await this.tcRepo.softDelete(tc.id);
    this.logCaseEvent(actor, "test_case.deleted", tc, "Deleted", suite);
  }

  // Assign (replace) the set of users on a case + optional deadline. Returns { testCase, addedUsers }.
  async assignUsers(actor, id, { userIds, deadline }) {
    const tc = await this.getTestCase(actor, id);
    const suite = await this.suiteService.getTestSuite(actor, tc.suiteId);
    await this.suiteService.projectService.assertCanManageProject(actor, suite.projectId);

    const before = new Set((tc.assignees ?? []).map((u) => u.id));
    const users = [];
    for (const uid of userIds) {
      const user = await this.authRepo.findUserById(uid);
      if (!user) throw new AppError(`User not found: ${uid}`, 404);
      if (user.organizationId !== actor.organizationId && actor.role !== UserRole.SUPERADMIN) {
        throw new AppError("You can only assign users from your organisation", 403);
      }
      users.push(user);
    }

    let saved = await this.tcRepo.setAssignees(tc, users.map((u) => ({ id: u.id })));

    if (deadline !== undefined) {
      saved = await this.tcRepo.update(saved.id, { deadline: deadline ?? null });
    }

    const addedUsers = users.filter((u) => !before.has(u.id)); // newly assigned

    ActivityService.Instance.log(actor, {
      action: "test_case.assigned",
      summary:
        users.length === 0
          ? `Cleared assignees on "${tc.title}" in suite "${suite.name}"`
          : `Assigned ${userLabel(users)} to "${tc.title}" in suite "${suite.name}"`,
      entityType: "test_case",
      entityId: tc.id,
      metadata: { suiteId: tc.suiteId, projectId: suite.projectId },
    });

    // Notify newly-assigned users (in-app + email), fire-and-forget.
    // The actor is excluded — nobody is notified about their own action.
    const notifyUsers = addedUsers.filter((u) => u.id !== actor.id);
    if (notifyUsers.length) {
      const me = await this.authRepo.findUserById(actor.id);
      const assignedByName = me
        ? [me.firstName, me.lastName].filter(Boolean).join(" ")
        : "An admin";
      NotificationService.Instance.notifyAssignment(notifyUsers, {
        caseTitle: tc.title,
        caseId: tc.id,
        suiteId: tc.suiteId,
        projectId: suite.projectId,
        assignedByName,
      }).catch((e) => console.error("[notify] assignment failed:", e.message));
    }

    return { testCase: saved, addedUsers };
  }

  // Add (or remove) a set of users across many cases at once, in a handful of
  // bulk queries — logged as ONE activity entry. `mode` is "add" (default) or
  // "remove". The add path is idempotent (ON CONFLICT DO NOTHING), so a retried
  // request after a client timeout is a harmless no-op rather than a double-assign.
  async bulkAssignUsers(actor, { caseIds, userIds, deadline, mode = "add" }) {
    const users = [];
    for (const uid of userIds) {
      const user = await this.authRepo.findUserById(uid);
      if (!user) throw new AppError(`User not found: ${uid}`, 404);
      if (user.organizationId !== actor.organizationId && actor.role !== UserRole.SUPERADMIN) {
        throw new AppError("You can only assign users from your organisation", 403);
      }
      users.push(user);
    }

    // Filter to cases in the caller's org, one query — silently drops any the
    // caller can't touch (e.g. cross-org ids), same visibility rule as getTestCase.
    const cases = await this.tcRepo.findBulkAssignable(caseIds, actor.organizationId);
    if (!cases.length) throw new AppError("No accessible test cases in the selection", 404);

    // A 'user' caller must be team lead of every project the selection touches.
    const projectIds = [...new Set(cases.map((c) => c.projectId))];
    for (const pid of projectIds) {
      await this.suiteService.projectService.assertCanManageProject(actor, pid);
    }

    const validIds = cases.map((c) => c.id);
    const sample = cases[0];

    const caseLabel = `${validIds.length} test case${validIds.length === 1 ? "" : "s"}`;
    const suiteLabel = `suite "${sample.suiteName}" in project "${sample.projectName}"`;

    if (mode === "remove") {
      await this.tcRepo.removeAssignees(validIds, userIds);

      ActivityService.Instance.log(actor, {
        action: "test_case.unassigned",
        summary: `Removed ${userLabel(users)} from ${caseLabel} in ${suiteLabel}`,
        entityType: "suite",
        entityId: sample.suiteId,
        metadata: { caseIds: validIds, suiteId: sample.suiteId, projectId: sample.projectId },
      });

      return { assignedCount: validIds.length, mode };
    }

    // Add: figure out who's genuinely new (for notifications) before inserting.
    const existingPairs = await this.tcRepo.findExistingAssigneePairs(validIds, userIds);
    const newlyAssignedUserIds = new Set();
    for (const cid of validIds) {
      for (const uid of userIds) {
        if (!existingPairs.has(`${cid}:${uid}`)) newlyAssignedUserIds.add(uid);
      }
    }

    await this.tcRepo.addAssignees(validIds, userIds);
    if (deadline !== undefined) {
      await this.tcRepo.setDeadlineForMany(validIds, deadline ?? null);
    }

    // Actor excluded — nobody is notified about their own action.
    const addedUsers = users.filter((u) => newlyAssignedUserIds.has(u.id) && u.id !== actor.id);
    if (addedUsers.length) {
      const me = await this.authRepo.findUserById(actor.id);
      const assignedByName = me
        ? [me.firstName, me.lastName].filter(Boolean).join(" ")
        : "An admin";
      // One notification per user for the whole batch (referencing a sample case)
      // instead of one per case — avoids flooding an assignee's inbox.
      NotificationService.Instance.notifyAssignment(addedUsers, {
        caseTitle: sample.title,
        caseId: sample.id,
        suiteId: sample.suiteId,
        projectId: sample.projectId,
        assignedByName,
      }).catch((e) => console.error("[notify] bulk assignment failed:", e.message));
    }

    ActivityService.Instance.log(actor, {
      action: "test_case.assigned",
      summary: `Assigned ${userLabel(users)} to ${caseLabel} in ${suiteLabel}`,
      entityType: "suite",
      entityId: sample.suiteId,
      metadata: { caseIds: validIds, suiteId: sample.suiteId, projectId: sample.projectId },
    });

    return { assignedCount: validIds.length, mode };
  }
}

module.exports = { TestCaseService };
