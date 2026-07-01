// modules/testCase/services/testCase.service.js
const { TestCaseRepository } = require("../repositories/testCase.repository");
const { TestSuiteService } = require("../../testSuite/services/testSuite.service");
const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { NotificationService } = require("../../notification/services/notification.service");
const { ActivityService } = require("../../activity/services/activity.service");
const { AppError } = require("../../../shared/errors/AppError");
const { TestCaseStatus, UserRole } = require("../../../config/constants");

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

  async fetchTestCases(actor, params) {
    await this.suiteService.getTestSuite(actor, params.suite); // org access check
    return this.tcRepo.fetchPaginated({
      ...params,
      suiteId: params.suite,
      assigneeId: this.isRestricted(actor) ? actor.id : undefined,
    });
  }

  async getTestCase(actor, id) {
    const tc = await this.tcRepo.findById(id);
    if (!tc || tc.deletedAt) {
      throw new AppError("Test case not found", 404);
    }
    await this.suiteService.getTestSuite(actor, tc.suiteId); // org access check
    if (this.isRestricted(actor) && !(tc.assignees ?? []).some((u) => u.id === actor.id)) {
      throw new AppError("Test case not found", 404); // hide unassigned cases
    }
    return tc;
  }

  logCaseEvent(actor, action, tc, verb, metadata = {}) {
    ActivityService.Instance.log(actor, {
      action,
      summary: `${verb} test case "${tc.title}"`,
      entityType: "test_case",
      entityId: tc.id,
      metadata: { suiteId: tc.suiteId, ...metadata },
    });
  }

  async createTestCase(actor, data) {
    const suite = await this.suiteService.getTestSuite(actor, data.suite);
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
    this.logCaseEvent(actor, "test_case.created", tc, "Created", { projectId: suite.projectId });
    return tc;
  }

  async updateTestCase(actor, id, data) {
    const tc = await this.getTestCase(actor, id);

    const patch = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.steps !== undefined) patch.steps = data.steps;
    if (data.expectedResult !== undefined) patch.expectedResult = data.expectedResult;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.status !== undefined) patch.status = data.status;
    if (data.tags !== undefined) patch.tags = data.tags;

    const updated = await this.tcRepo.update(tc.id, patch);
    this.logCaseEvent(actor, "test_case.updated", tc, "Updated");
    return updated;
  }

  async deleteTestCase(actor, id) {
    const tc = await this.getTestCase(actor, id);
    await this.tcRepo.softDelete(tc.id);
    this.logCaseEvent(actor, "test_case.deleted", tc, "Deleted");
  }

  // Assign (replace) the set of users on a case + optional deadline. Returns { testCase, addedUsers }.
  async assignUsers(actor, id, { userIds, deadline }) {
    const tc = await this.getTestCase(actor, id);
    const suite = await this.suiteService.getTestSuite(actor, tc.suiteId);

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
      summary: `Assigned ${users.length} user${users.length === 1 ? "" : "s"} to "${tc.title}"`,
      entityType: "test_case",
      entityId: tc.id,
      metadata: { suiteId: tc.suiteId, projectId: suite.projectId },
    });

    // Notify newly-assigned users (in-app + email), fire-and-forget.
    if (addedUsers.length) {
      const me = await this.authRepo.findUserById(actor.id);
      const assignedByName = me
        ? [me.firstName, me.lastName].filter(Boolean).join(" ")
        : "An admin";
      NotificationService.Instance.notifyAssignment(addedUsers, {
        caseTitle: tc.title,
        caseId: tc.id,
        suiteId: tc.suiteId,
        projectId: suite.projectId,
        assignedByName,
      }).catch((e) => console.error("[notify] assignment failed:", e.message));
    }

    return { testCase: saved, addedUsers };
  }
}

module.exports = { TestCaseService };
