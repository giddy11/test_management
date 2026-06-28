// modules/project/services/project.service.js
const { ProjectRepository } = require("../repositories/project.repository");
const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { AppError } = require("../../../shared/errors/AppError");

class ProjectService {
  static Instance = new ProjectService();

  constructor(
    projectRepo = ProjectRepository.Instance,
    authRepo = AuthRepository.Instance
  ) {
    this.projectRepo = projectRepo;
    this.authRepo = authRepo;
  }

  async fetchProjects(params) {
    return this.projectRepo.fetchPaginated(params);
  }

  async getProject(ownerId, id) {
    const project = await this.projectRepo.findById(id);
    if (!project || project.deletedAt) {
      throw new AppError("Project not found", 404);
    }
    this.assertOwner(project, ownerId);
    return project;
  }

  async createProject(ownerId, data) {
    const members = await this.resolveMembers(data.memberIds);
    return this.projectRepo.create({
      name: data.name,
      description: data.description ?? null,
      ownerId,
      ...(members ? { members } : {}),
    });
  }

  async updateProject(ownerId, id, data) {
    const project = await this.getProject(ownerId, id);

    if (data.name !== undefined) project.name = data.name;
    if (data.description !== undefined) project.description = data.description;
    if (data.memberIds !== undefined) {
      project.members = (await this.resolveMembers(data.memberIds)) ?? [];
    }

    return this.projectRepo.save(project);
  }

  async deleteProject(ownerId, id) {
    const project = await this.getProject(ownerId, id);
    await this.projectRepo.softDelete(project.id);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  assertOwner(project, ownerId) {
    if (project.ownerId !== ownerId) {
      throw new AppError("You do not have access to this project", 403);
    }
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
