// modules/project/services/project.service.js
const { ProjectRepository } = require("../repositories/project.repository");
const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { TestCaseRepository } = require("../../testCase/repositories/testCase.repository");
const { ActivityService } = require("../../activity/services/activity.service");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole } = require("../../../config/constants");

// `actor` is the authenticated user: { id, role, organizationId }.
class ProjectService {
  static Instance = new ProjectService();

  constructor(
    projectRepo = ProjectRepository.Instance,
    authRepo = AuthRepository.Instance,
    testCaseRepo = TestCaseRepository.Instance
  ) {
    this.projectRepo = projectRepo;
    this.authRepo = authRepo;
    this.testCaseRepo = testCaseRepo;
  }

  isSuperadmin(actor) {
    return actor.role === UserRole.SUPERADMIN;
  }

  // Superadmin sees every org; admins see every project in their own org. A plain
  // 'user' additionally must be assigned to at least one test case somewhere in the
  // project — otherwise there'd be nothing for them to see inside it anyway, and
  // leaving the project itself visible would just be security-by-obscurity once the
  // list is filtered (see ProjectRepository.fetchPaginated's assigneeId filter).
  async assertAccess(actor, project) {
    if (this.isSuperadmin(actor)) return;
    if (!actor.organizationId || project.organizationId !== actor.organizationId) {
      throw new AppError("You do not have access to this project", 403);
    }
    if (actor.role === UserRole.USER) {
      const hasAssignment = await this.testCaseRepo.hasAssignmentInProject(project.id, actor.id);
      if (!hasAssignment) {
        throw new AppError("You do not have access to this project", 403);
      }
    }
  }

  async fetchProjects(actor, params) {
    return this.projectRepo.fetchPaginated({
      ...params,
      organizationId: this.isSuperadmin(actor) ? undefined : actor.organizationId,
      assigneeId: actor.role === UserRole.USER ? actor.id : undefined,
    });
  }

  async getProject(actor, id) {
    const project = await this.projectRepo.findById(id);
    if (!project || project.deletedAt) {
      throw new AppError("Project not found", 404);
    }
    await this.assertAccess(actor, project);
    return project;
  }

  async createProject(actor, data) {
    const members = await this.resolveMembers(data.memberIds);
    const project = await this.projectRepo.create({
      name: data.name,
      description: data.description ?? null,
      ownerId: actor.id,
      organizationId: actor.organizationId,
      ...(members ? { members } : {}),
    });
    ActivityService.Instance.log(actor, {
      action: "project.created",
      summary: `Created project "${project.name}"`,
      entityType: "project",
      entityId: project.id,
    });
    return project;
  }

  async updateProject(actor, id, data) {
    const project = await this.getProject(actor, id);

    if (data.name !== undefined) project.name = data.name;
    if (data.description !== undefined) project.description = data.description;
    if (data.memberIds !== undefined) {
      project.members = (await this.resolveMembers(data.memberIds)) ?? [];
    }

    const saved = await this.projectRepo.save(project);
    ActivityService.Instance.log(actor, {
      action: "project.updated",
      summary: `Updated project "${saved.name}"`,
      entityType: "project",
      entityId: saved.id,
    });
    return saved;
  }

  async deleteProject(actor, id) {
    const project = await this.getProject(actor, id);
    await this.projectRepo.softDelete(project.id);
    ActivityService.Instance.log(actor, {
      action: "project.deleted",
      summary: `Deleted project "${project.name}"`,
      entityType: "project",
      entityId: project.id,
    });
  }

  async resolveMembers(memberIds) {
    if (!memberIds) return undefined;
    const members = [];
    for (const id of memberIds) {
      const user = await this.authRepo.findUserById(id);
      if (!user) throw new AppError(`Member not found: ${id}`, 404);
      members.push({ id });
    }
    return members;
  }
}

module.exports = { ProjectService };
