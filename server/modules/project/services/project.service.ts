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
const { ProjectMemberRole } = require("../../../config/constants");
const { can, assertPermission } = require("../../../shared/access/can");
const { seesAllProjects } = require("../../../shared/access/scope");

// What a person can be IN one project — see ProjectService.getProjectRole.
export const ProjectRole = { LEAD: "lead", MEMBER: "member", VIEWER: "viewer" } as const;
export type ProjectRoleValue = (typeof ProjectRole)[keyof typeof ProjectRole];

interface ProjectInput {
  name?: string;
  description?: string | null;
  members?: MemberInput[];
  supportWhatsappNumber?: string | null;
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

  // Is this person recorded as the project's team lead? Membership only — the
  // org-wide override lives in canManageProject, and org-wide READ visibility
  // (which callers check separately) is deliberately not consulted here: a role
  // with org-wide read that is also a project's lead must still be its lead.
  async isTeamLead(actor: Actor, projectId: string): Promise<boolean> {
    const role = await this.memberRepo.getRole(projectId, actor.id);
    return role === ProjectMemberRole.TEAM_LEAD;
  }

  // The person's role IN ONE PROJECT — the thing that decides what they may do
  // there. Platform roles only say whether projects are usable at all (and, via
  // project.readall / project.manageall, whether to look or act across all of
  // them); everything finer is decided here.
  //
  //   lead    manage the project: suites, cases, assignment, deleting things,
  //           triage, decisions, live-chat and ticket management, membership.
  //           Also anyone holding project.manageall, in any project of the org.
  //   member  contribute: run tests, record results on their own cases, report
  //           bugs, raise/vote/comment on feature requests, add notes.
  //   viewer  read only. Reached only through org-wide read (project.readall)
  //           without being on the project — a stakeholder, not a participant.
  //
  // Callers must already have established access to the project (getProject /
  // a getAccessible that calls it): this resolves a role, it does not check that
  // the project belongs to the actor's organisation.
  async getProjectRole(actor: Actor, projectId: string): Promise<ProjectRoleValue | null> {
    if (can(actor, "project.manageall")) return ProjectRole.LEAD;
    const membership = await this.memberRepo.getRole(projectId, actor.id);
    if (membership === ProjectMemberRole.TEAM_LEAD) return ProjectRole.LEAD;
    if (membership) return ProjectRole.MEMBER;
    // Legacy behaviour, kept so nobody loses access: being assigned a test case
    // in the project counts as being on it.
    if (await this.testCaseRepo.hasAssignmentInProject(projectId, actor.id)) {
      return ProjectRole.MEMBER;
    }
    return seesAllProjects(actor) ? ProjectRole.VIEWER : null;
  }

  // Management inside a project (create/edit suites & cases, assign testers,
  // manage runs/bugs/feature requests, membership, links). Holding
  // project.manageall means authority over every project in the organisation;
  // everyone else must be THIS project's team lead.
  async canManageProject(actor: Actor, projectId: string): Promise<boolean> {
    if (can(actor, "project.manageall")) return true;
    return this.isTeamLead(actor, projectId);
  }

  async assertCanManageProject(actor: Actor, projectId: string): Promise<void> {
    if (!(await this.canManageProject(actor, projectId))) {
      throw new AppError("Only this project's team lead or an administrator can do this", 403);
    }
  }

  // Taking part: anything a project member may do. An org-wide viewer can SEE
  // every project but is not on any of them, so this is what keeps a read-only
  // stakeholder from reporting bugs, starting runs or commenting.
  async assertCanContribute(actor: Actor, projectId: string): Promise<void> {
    const role = await this.getProjectRole(actor, projectId);
    if (role === ProjectRole.LEAD || role === ProjectRole.MEMBER) return;
    if (role === ProjectRole.VIEWER) {
      throw new AppError("You have read-only access to this project", 403);
    }
    throw new AppError("You do not have access to this project", 403);
  }

  // Admins (including superadmin) see every project in their own org — a
  // superadmin's own org is never a real client company, so this deliberately
  // does NOT give them cross-company access. A plain 'user' must additionally
  // be a member of the project, or (legacy behaviour, kept so nobody loses
  // access) be assigned to at least one test case somewhere in the project.
  async assertAccess(actor: Actor, project: Project): Promise<void> {
    if (!actor.organizationId || project.organizationId !== actor.organizationId) {
      throw new AppError("You do not have access to this project", 403);
    }
    if (!seesAllProjects(actor)) {
      const memberRole = await this.memberRepo.getRole(project.id, actor.id);
      if (memberRole) return;
      const hasAssignment = await this.testCaseRepo.hasAssignmentInProject(project.id, actor.id);
      if (!hasAssignment) {
        throw new AppError("You do not have access to this project", 403);
      }
    }
  }

  async fetchProjects(actor: Actor, params: Record<string, unknown>) {
    const result = await this.projectRepo.fetchPaginated({
      ...params,
      organizationId: actor.organizationId,
      restrictedUserId: seesAllProjects(actor) ? undefined : actor.id,
    });

    // Lets a client-side picker (e.g. the Contact support widget) know which
    // of the listed projects this viewer may edit, without a per-project fetch.
    const isPlatformManager = can(actor, "project.manageall");
    const leadProjectIds = isPlatformManager
      ? null
      : new Set(await this.memberRepo.findLeadProjectIds(actor.id));
    result.data.forEach((p: Project) => {
      p.canManage = isPlatformManager || (leadProjectIds?.has(p.id) ?? false);
    });

    return result;
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
    // The one project action that cannot be project-level: there is no project
    // yet to hold a role in. Also enforced at the route; this is the second layer.
    assertPermission(actor, "project.manageall");
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
    // Editing a project — including who is on it and who leads it — is the
    // team lead's job. This method used to lean on the route guard alone.
    await this.assertCanManageProject(actor, project.id);

    if (data.name !== undefined) project.name = data.name;
    if (data.description !== undefined) project.description = data.description;
    if (data.supportWhatsappNumber !== undefined) project.supportWhatsappNumber = data.supportWhatsappNumber;
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
    await this.assertCanManageProject(actor, project.id);
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
      if (user.organizationId !== actor.organizationId) {
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
