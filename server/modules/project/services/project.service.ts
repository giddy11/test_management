// modules/project/services/project.service.ts
import { Project } from "../entities/project.entity";
import { ProjectRepository } from "../repositories/project.repository";
import {
  ProjectMemberRepository,
  MemberInput,
} from "../repositories/projectMember.repository";
import type { Actor } from "../../../shared/types/actor";

const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { TestCaseRepository } = require("../../testCase/repositories/testCase.repository");
const { ActivityService } = require("../../activity/services/activity.service");
const { NotificationService } = require("../../notification/services/notification.service");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole, ProjectMemberRole } = require("../../../config/constants");

interface ProjectInput {
  name?: string;
  description?: string | null;
  members?: MemberInput[];
}

// A validated member: the hydrated user plus the project role they were given.
interface ResolvedMember {
  user: { id: string; email: string; firstName: string; lastName: string | null; organizationId: string | null };
  role: string;
}

export class ProjectService {
  static Instance = new ProjectService();

  projectRepo: any;
  authRepo: any;
  testCaseRepo: any;
  memberRepo: ProjectMemberRepository;
  notificationService: any;

  constructor(
    projectRepo = ProjectRepository.Instance,
    authRepo = AuthRepository.Instance,
    testCaseRepo = TestCaseRepository.Instance,
    memberRepo = ProjectMemberRepository.Instance,
    notificationService = NotificationService.Instance
  ) {
    this.projectRepo = projectRepo;
    this.authRepo = authRepo;
    this.testCaseRepo = testCaseRepo;
    this.memberRepo = memberRepo;
    this.notificationService = notificationService;
  }

  isSuperadmin(actor: Actor): boolean {
    return actor.role === UserRole.SUPERADMIN;
  }

  // Team leads get unrestricted visibility inside their project (all suites and
  // cases). Admins/superadmins are already unrestricted, so this only matters
  // for the 'user' role — used by TestSuiteService and TestCaseService.
  async isTeamLead(actor: Actor, projectId: string): Promise<boolean> {
    if (actor.role !== UserRole.USER) return false;
    const role = await this.memberRepo.getRole(projectId, actor.id);
    return role === ProjectMemberRole.TEAM_LEAD;
  }

  // Management inside a project (create/edit suites & cases, assign testers,
  // manage runs/bugs/feature requests) is allowed for admins/superadmins and
  // for that project's team leads. Routes let the 'user' role through and the
  // services enforce this per-project check.
  async canManageProject(actor: Actor, projectId: string): Promise<boolean> {
    if (actor.role !== UserRole.USER) return true;
    return this.isTeamLead(actor, projectId);
  }

  async assertCanManageProject(actor: Actor, projectId: string): Promise<void> {
    if (!(await this.canManageProject(actor, projectId))) {
      throw new AppError("Only admins or this project's team lead can do this", 403);
    }
  }

  // Superadmin sees every org; admins see every project in their own org. A
  // plain 'user' must additionally be a member of the project, or (legacy
  // behaviour, kept so nobody loses access) be assigned to at least one test
  // case somewhere in the project.
  async assertAccess(actor: Actor, project: Project): Promise<void> {
    if (this.isSuperadmin(actor)) return;
    if (!actor.organizationId || project.organizationId !== actor.organizationId) {
      throw new AppError("You do not have access to this project", 403);
    }
    if (actor.role === UserRole.USER) {
      const memberRole = await this.memberRepo.getRole(project.id, actor.id);
      if (memberRole) return;
      const hasAssignment = await this.testCaseRepo.hasAssignmentInProject(project.id, actor.id);
      if (!hasAssignment) {
        throw new AppError("You do not have access to this project", 403);
      }
    }
  }

  async fetchProjects(actor: Actor, params: Record<string, unknown>) {
    return this.projectRepo.fetchPaginated({
      ...params,
      organizationId: this.isSuperadmin(actor) ? undefined : actor.organizationId,
      restrictedUserId: actor.role === UserRole.USER ? actor.id : undefined,
    });
  }

  async getProject(actor: Actor, id: string): Promise<Project> {
    const project = await this.projectRepo.findById(id);
    if (!project || project.deletedAt) {
      throw new AppError("Project not found", 404);
    }
    await this.assertAccess(actor, project);
    return project;
  }

  async createProject(actor: Actor, data: ProjectInput): Promise<Project> {
    const members = await this.resolveMembers(actor, data.members);
    const project = await this.projectRepo.create({
      name: data.name,
      description: data.description ?? null,
      ownerId: actor.id,
      organizationId: actor.organizationId,
    });

    if (members && members.length > 0) {
      await this.memberRepo.setMembers(
        project.id,
        members.map((m) => ({ userId: m.user.id, role: m.role }))
      );
      this.notifyMembersAdded(actor, project, members);
    }

    ActivityService.Instance.log(actor, {
      action: "project.created",
      summary: `Created project "${project.name}"`,
      entityType: "project",
      entityId: project.id,
    });
    // Re-fetch only when members were attached, so the response includes them hydrated.
    if (members && members.length > 0) {
      return (await this.projectRepo.findById(project.id)) ?? project;
    }
    return project;
  }

  async updateProject(actor: Actor, id: string, data: ProjectInput): Promise<Project> {
    const project = await this.getProject(actor, id);

    if (data.name !== undefined) project.name = data.name;
    if (data.description !== undefined) project.description = data.description;
    const saved = await this.projectRepo.save(project);

    if (data.members !== undefined) {
      const members = (await this.resolveMembers(actor, data.members)) ?? [];
      const existingIds = new Set((project.memberships ?? []).map((m) => m.userId));
      await this.memberRepo.setMembers(
        project.id,
        members.map((m) => ({ userId: m.user.id, role: m.role }))
      );
      const added = members.filter((m) => !existingIds.has(m.user.id));
      this.notifyMembersAdded(actor, saved, added);
    }

    ActivityService.Instance.log(actor, {
      action: "project.updated",
      summary: `Updated project "${saved.name}"`,
      entityType: "project",
      entityId: saved.id,
    });
    // Re-fetch only when the member list changed, so the response reflects it hydrated.
    if (data.members !== undefined) {
      return (await this.projectRepo.findById(saved.id)) ?? saved;
    }
    return saved;
  }

  async deleteProject(actor: Actor, id: string): Promise<void> {
    const project = await this.getProject(actor, id);
    await this.projectRepo.softDelete(project.id);
    ActivityService.Instance.log(actor, {
      action: "project.deleted",
      summary: `Deleted project "${project.name}"`,
      entityType: "project",
      entityId: project.id,
    });
  }

  // Validates the submitted member list: every user must exist and belong to
  // the actor's organisation (superadmin is exempt from the org check).
  // Duplicate userIds collapse to the last entry submitted.
  async resolveMembers(
    actor: Actor,
    members?: MemberInput[]
  ): Promise<ResolvedMember[] | undefined> {
    if (!members) return undefined;
    const byId = new Map<string, ResolvedMember>();
    for (const m of members) {
      const user = await this.authRepo.findUserById(m.userId);
      if (!user) throw new AppError(`Member not found: ${m.userId}`, 404);
      if (!this.isSuperadmin(actor) && user.organizationId !== actor.organizationId) {
        throw new AppError("Members must belong to your organization", 400);
      }
      byId.set(user.id, { user, role: m.role ?? ProjectMemberRole.MEMBER });
    }
    return [...byId.values()];
  }

  // Fire-and-forget — a notification failure never breaks the request.
  notifyMembersAdded(actor: Actor, project: Project, added: ResolvedMember[]): void {
    const recipients = added.filter((m) => m.user.id !== actor.id);
    if (recipients.length === 0) return;
    Promise.resolve(this.authRepo.findUserById(actor.id))
      .then((byUser: { firstName: string; lastName: string | null } | null) => {
        const byName = byUser
          ? [byUser.firstName, byUser.lastName].filter(Boolean).join(" ")
          : "An admin";
        return this.notificationService.notifyProjectMemberAdded(recipients, {
          projectId: project.id,
          projectName: project.name,
          addedByName: byName,
        });
      })
      .catch((e: Error) => console.error("[project] member-added notify failed:", e.message));
  }
}
