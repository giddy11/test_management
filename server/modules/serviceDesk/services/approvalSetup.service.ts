// modules/serviceDesk/services/approvalSetup.service.ts
// Setting up who approves: approver groups (with their authority), approval
// policies (ordered steps), line managers, and each person's own
// out-of-office delegation. Everything but delegation is servicedesk.manage;
// delegation is self-service for anyone who may approve.
import { ApprovalSetupRepository } from "../repositories/approvalSetup.repository";
import { ServiceDeskRepository, type PersonRow } from "../repositories/serviceDesk.repository";
import { ServiceDeskService, PERMS, type DeskActor } from "./serviceDesk.service";
import type { PolicyStep } from "../domain/approvalPlan";
import type { RiskLevel } from "../domain/lifecycle";
import type { DelegationBody, GroupBody, PolicyBody } from "../validators/serviceDesk.schema";

const { AppError } = require("../../../shared/errors/AppError");
const { ActivityService } = require("../../activity/services/activity.service");

export class ApprovalSetupService {
  static Instance = new ApprovalSetupService();

  constructor(
    private readonly repo = ApprovalSetupRepository.Instance,
    private readonly deskRepo = ServiceDeskRepository.Instance,
    private readonly desk = ServiceDeskService.Instance,
    private readonly activity = ActivityService.Instance
  ) {}

  // People who may sit in an approval step at all (and so in a group, a
  // policy, or be a delegate): internal, and able to reach the approvals routes.
  private async approverPool(organizationId: string): Promise<Map<string, PersonRow>> {
    const people = await this.deskRepo.usersWithPermission(organizationId, [PERMS.CREATE, PERMS.MANAGE]);
    return new Map(people.map((p) => [p.id, p]));
  }

  // ── Approver groups ────────────────────────────────────────────────────────
  async listGroups(actor: DeskActor) {
    const organizationId = this.desk.orgOf(actor);
    const [groups, pool] = await Promise.all([this.repo.listGroups(organizationId), this.approverPool(organizationId)]);
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      maxRiskLevel: g.maxRiskLevel,
      members: g.memberIds
        .map((id) => pool.get(id))
        .filter((p): p is PersonRow => !!p)
        .map((p) => ({ id: p.id, name: p.name || p.email, email: p.email })),
    }));
  }

  async saveGroup(actor: DeskActor, id: string | null, body: GroupBody) {
    const organizationId = this.desk.orgOf(actor);
    const existing = id ? await this.repo.findGroup(organizationId, id) : null;
    if (id && !existing) throw new AppError("Approver group not found", 404);
    const groupName = body.name ?? existing?.name;
    if (!groupName) throw new AppError("Give the group a name", 422, [{ field: "name", message: "Give the group a name" }]);
    if (await this.repo.groupNameTaken(organizationId, groupName, id ?? undefined)) {
      throw new AppError("There's already a group with that name", 409);
    }
    if (body.memberIds) {
      const pool = await this.approverPool(organizationId);
      if (body.memberIds.some((m) => !pool.has(m))) {
        throw new AppError("Every member must be a colleague who can use IT requests", 422, [
          { field: "memberIds", message: "Pick members from the list" },
        ]);
      }
    }
    const fields = {
      name: groupName,
      description: body.description !== undefined ? body.description : existing?.description ?? null,
      maxRiskLevel: (body.maxRiskLevel ?? existing?.maxRiskLevel ?? "medium") as RiskLevel,
    };
    // Membership and authority decide who may approve what — audited as such.
    await this.repo.saveGroup(
      organizationId,
      id,
      fields,
      body.memberIds,
      this.activity.buildEntry(actor, {
        action: id ? "service_approver_group.updated" : "service_approver_group.created",
        summary: `${id ? "Updated" : "Created"} the approver group "${groupName}"`,
        entityType: "service_approver_group",
        severity: "warning",
        metadata: { maxRiskLevel: fields.maxRiskLevel, memberIds: body.memberIds },
      })
    );
    return (await this.listGroups(actor)).find((g) => g.name === groupName);
  }

  async deleteGroup(actor: DeskActor, id: string) {
    const organizationId = this.desk.orgOf(actor);
    const existing = await this.repo.findGroup(organizationId, id);
    if (!existing) throw new AppError("Approver group not found", 404);
    const usedBy = await this.repo.policiesUsingGroup(organizationId, id);
    if (usedBy.length) {
      throw new AppError(`This group is used by ${usedBy.map((n) => `"${n}"`).join(", ")}. Remove it from those policies first.`, 409);
    }
    await this.repo.deleteGroup(
      organizationId,
      id,
      this.activity.buildEntry(actor, {
        action: "service_approver_group.deleted",
        summary: `Deleted the approver group "${existing.name}"`,
        entityType: "service_approver_group",
        entityId: id,
      })
    );
  }

  // ── Policies ───────────────────────────────────────────────────────────────
  async listPolicies(actor: DeskActor) {
    const organizationId = this.desk.orgOf(actor);
    const policies = await this.repo.listPolicies(organizationId);
    return policies.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      steps: p.steps,
      itemCount: p.itemCount,
      updatedAt: p.updatedAt,
    }));
  }

  async savePolicy(actor: DeskActor, id: string | null, body: PolicyBody) {
    const organizationId = this.desk.orgOf(actor);
    const existing = id ? await this.repo.findPolicy(organizationId, id) : null;
    if (id && !existing) throw new AppError("Approval policy not found", 404);
    const policyName = body.name ?? existing?.name;
    if (!policyName) throw new AppError("Give the policy a name", 422, [{ field: "name", message: "Give the policy a name" }]);
    if (!id && !body.steps) throw new AppError("A policy needs at least one step", 422, [{ field: "steps", message: "Add a step" }]);
    if (await this.repo.policyNameTaken(organizationId, policyName, id ?? undefined)) {
      throw new AppError("There's already a policy with that name", 409);
    }
    if (body.steps) await this.assertStepsResolvable(organizationId, body.steps);

    const saved = await this.repo.savePolicy(
      organizationId,
      id,
      {
        name: policyName,
        ...(body.description !== undefined && { description: body.description }),
        ...(body.steps && { steps: body.steps }),
      },
      this.activity.buildEntry(actor, {
        action: id ? "service_approval_policy.updated" : "service_approval_policy.created",
        summary: `${id ? "Updated" : "Created"} the approval policy "${policyName}"`,
        entityType: "service_approval_policy",
        severity: "warning",
        metadata: { steps: body.steps },
      })
    );
    return (await this.listPolicies(actor)).find((p) => p.id === saved.id);
  }

  async deletePolicy(actor: DeskActor, id: string) {
    const organizationId = this.desk.orgOf(actor);
    const existing = (await this.repo.listPolicies(organizationId)).find((p) => p.id === id);
    if (!existing) throw new AppError("Approval policy not found", 404);
    if (existing.itemCount > 0) {
      throw new AppError(
        `${existing.itemCount} catalog item${existing.itemCount === 1 ? " uses" : "s use"} this policy. Point ${existing.itemCount === 1 ? "it" : "them"} elsewhere first.`,
        409
      );
    }
    await this.repo.deletePolicy(
      organizationId,
      id,
      this.activity.buildEntry(actor, {
        action: "service_approval_policy.deleted",
        summary: `Deleted the approval policy "${existing.name}"`,
        entityType: "service_approval_policy",
        entityId: id,
      })
    );
  }

  // Every named person and group must exist in this organisation.
  private async assertStepsResolvable(organizationId: string, steps: PolicyStep[]) {
    const pool = await this.approverPool(organizationId);
    const groups = new Set((await this.repo.listGroups(organizationId)).map((g) => g.id));
    steps.forEach((step, i) => {
      for (const rule of step.approvers) {
        if (rule.type === "user" && !pool.has(rule.userId)) {
          throw new AppError(`Step ${i + 1} names someone who can't approve IT requests`, 422, [
            { field: `steps.${i}`, message: "Pick approvers from the list" },
          ]);
        }
        if (rule.type === "group" && !groups.has(rule.groupId)) {
          throw new AppError(`Step ${i + 1} names a group that doesn't exist`, 422, [
            { field: `steps.${i}`, message: "Pick a group from the list" },
          ]);
        }
      }
    });
  }

  // ── Line managers ──────────────────────────────────────────────────────────
  async listManagers(actor: DeskActor) {
    const organizationId = this.desk.orgOf(actor);
    return this.repo.listManagers(organizationId);
  }

  async setManager(actor: DeskActor, userId: string, managerId: string | null) {
    const organizationId = this.desk.orgOf(actor);
    const people = await this.repo.listManagers(organizationId);
    const person = people.find((p) => p.id === userId);
    if (!person) throw new AppError("Person not found", 404);
    if (managerId) {
      const manager = people.find((p) => p.id === managerId);
      if (!manager) throw new AppError("Pick a manager from your organisation", 422, [{ field: "managerId", message: "Pick someone from the list" }]);
      if (managerId === userId) throw new AppError("Someone can't be their own manager", 422);
      // No loops: the new manager may not report (however indirectly) to this person.
      if ((await this.repo.chainAbove(organizationId, managerId)).includes(userId)) {
        throw new AppError(`${manager.name} already reports to ${person.name}`, 422);
      }
    }
    await this.repo.setManager(
      organizationId,
      userId,
      managerId,
      this.activity.buildEntry(actor, {
        action: "user.manager_changed",
        summary: managerId
          ? `Set ${person.name}'s line manager to ${people.find((p) => p.id === managerId)?.name}`
          : `Removed ${person.name}'s line manager`,
        entityType: "user",
        entityId: userId,
        metadata: { from: person.managerId, to: managerId },
      })
    );
    return (await this.repo.listManagers(organizationId)).find((p) => p.id === userId);
  }

  // ── My delegation (self-service) ───────────────────────────────────────────
  async myDelegation(actor: DeskActor) {
    this.desk.orgOf(actor);
    return this.repo.delegationOf(actor.id);
  }

  async delegateCandidates(actor: DeskActor) {
    const organizationId = this.desk.orgOf(actor);
    const pool = await this.approverPool(organizationId);
    return [...pool.values()]
      .filter((p) => p.id !== actor.id)
      .map((p) => ({ id: p.id, name: p.name || p.email, email: p.email }));
  }

  async setDelegation(actor: DeskActor, body: DelegationBody) {
    const organizationId = this.desk.orgOf(actor);
    if (body.delegateId === actor.id) throw new AppError("Pick someone other than yourself", 422);
    const pool = await this.approverPool(organizationId);
    if (!pool.has(body.delegateId)) {
      throw new AppError("Your stand-in must be a colleague who can approve IT requests", 422, [
        { field: "delegateId", message: "Pick someone from the list" },
      ]);
    }
    await this.repo.saveDelegation({
      userId: actor.id,
      organizationId,
      delegateId: body.delegateId,
      startsOn: body.startsOn,
      endsOn: body.endsOn,
      note: body.note,
    });
    this.activity.log(actor, {
      action: "service_delegation.set",
      summary: `Asked ${pool.get(body.delegateId)?.name} to approve IT requests for them from ${body.startsOn} to ${body.endsOn}`,
      entityType: "user",
      entityId: actor.id,
    });
    return this.repo.delegationOf(actor.id);
  }

  async clearDelegation(actor: DeskActor) {
    this.desk.orgOf(actor);
    await this.repo.deleteDelegation(actor.id);
    this.activity.log(actor, {
      action: "service_delegation.cleared",
      summary: "Stopped delegating IT-request approvals",
      entityType: "user",
      entityId: actor.id,
    });
  }
}
