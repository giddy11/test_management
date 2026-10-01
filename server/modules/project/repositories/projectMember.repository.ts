// modules/project/repositories/projectMember.repository.ts
// All data access for project membership rows. No business logic here.
import type { Repository } from "typeorm";
import { ProjectMember } from "../entities/projectMember.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

const { ProjectMemberRole } = require("../../../config/constants");

export interface MemberInput {
  userId: string;
  role: string; // ProjectMemberRole
}

// Shape of the User entity fields the notification fan-out needs.
export interface MemberUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
}

export class ProjectMemberRepository {
  static Instance = new ProjectMemberRepository();

  private repo: Repository<ProjectMember>;

  constructor() {
    this.repo = AppDataSource.getRepository(ProjectMember);
  }

  // Membership rows with the user hydrated — for project detail responses.
  async findByProject(projectId: string): Promise<ProjectMember[]> {
    return this.repo.find({
      where: { projectId },
      relations: { user: true },
    });
  }

  // The actor's role inside a project, or null when they aren't a member.
  async getRole(projectId: string, userId: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { projectId, userId } });
    return row ? row.role : null;
  }

  // Every project this user leads — one query instead of a per-project
  // getRole() call, for callers deciding manage authority across a list that
  // spans many projects (see FeedbackService.fetchFeedback's global mode).
  async findLeadProjectIds(userId: string): Promise<string[]> {
    const rows = await this.repo.find({ where: { userId, role: ProjectMemberRole.TEAM_LEAD } });
    return rows.map((r) => r.projectId);
  }

  // Replace the full member list of a project (delete + insert — the list is
  // small and always sent whole from the project form).
  async setMembers(projectId: string, members: MemberInput[]): Promise<void> {
    await this.repo.delete({ projectId });
    if (members.length === 0) return;
    await this.repo.save(
      members.map((m) => ({ projectId, userId: m.userId, role: m.role }))
    );
  }

  // Hydrated users of every member — notification recipients for project events.
  async findMemberUsers(projectId: string): Promise<MemberUser[]> {
    const rows = await this.repo.find({
      where: { projectId },
      relations: { user: true },
    });
    return rows
      .map((r) => r.user as MemberUser | undefined)
      .filter((u): u is MemberUser => Boolean(u));
  }
}
