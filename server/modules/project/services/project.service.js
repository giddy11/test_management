// modules/project/services/project.service.js
const { ProjectRepository } = require("../repositories/project.repository");
const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole } = require("../../../config/constants");

// `actor` is the authenticated user: { id, role, organizationId }.
class ProjectService {
  static Instance = new ProjectService();

  constructor(
    projectRepo = ProjectRepository.Instance,
    authRepo = AuthRepository.Instance
  ) {
    this.projectRepo = projectRepo;
    this.authRepo = authRepo;
  }

  isSuperadmin(actor) {
    return actor.role === UserRole.SUPERADMIN;
  }

  // Superadmin sees every org; everyone else is scoped to their organisation.
  assertAccess(actor, project) {
    if (this.isSuperadmin(actor)) return;
    if (!actor.organizationId || project.organizationId !== actor.organizationId) {
      throw new AppError("You do not have access to this project", 403);
    }
  }

  async fetchProjects(actor, params) {
    return this.projectRepo.fetchPaginated({
      ...params,
      organizationId: this.isSuperadmin(actor) ? undefined : actor.organizationId,
    });
  }

  async getProject(actor, id) {
    const project = await this.projectRepo.findById(id);
    if (!project || project.deletedAt) {
      throw new AppError("Project not found", 404);
    }
    this.assertAccess(actor, project);
    return project;
  }

  async createProject(actor, data) {
    const members = await this.resolveMembers(data.memberIds);
    return this.projectRepo.create({
      name: data.name,
      description: data.description ?? null,
      ownerId: actor.id,
      organizationId: actor.organizationId,
      ...(members ? { members } : {}),
    });
  }

  async updateProject(actor, id, data) {
    const project = await this.getProject(actor, id);

    if (data.name !== undefined) project.name = data.name;
    if (data.description !== undefined) project.description = data.description;
    if (data.memberIds !== undefined) {
      project.members = (await this.resolveMembers(data.memberIds)) ?? [];
    }

    return this.projectRepo.save(project);
  }

  async deleteProject(actor, id) {
    const project = await this.getProject(actor, id);
    await this.projectRepo.softDelete(project.id);
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
