// modules/serviceDesk/services/serviceDeskAi.service.ts
// IT requests on the shared AI layer: intake on the portal and triage for
// approvers and IT. Keys, credits, usage logging and provider fallbacks are
// all AiService's; this file only decides who may ask, what the model sees,
// and what is kept. See domain/serviceDeskAi.ts for the prompts.
import { AiService } from "../../ai/services/ai.service";
import { ServiceRequestRepository } from "../repositories/serviceRequest.repository";
import { AutomationRepository } from "../repositories/automation.repository";
import { ServiceDeskService, PERMS, type DeskActor } from "./serviceDesk.service";
import {
  INTAKE_SYSTEM_PROMPT,
  TRIAGE_SYSTEM_PROMPT,
  answerText,
  buildIntakePrompt,
  buildTriagePrompt,
  finishIntake,
  finishTriage,
  intakeJsonSchema,
  intakeReplySchema,
  triageJsonSchema,
  triageReplySchema,
  type CatalogEntry,
} from "../domain/serviceDeskAi";
import { STATUS_LABELS, formatReference } from "../domain/lifecycle";
import type { AiTriage } from "../entities/serviceRequest.entity";

const { AppError } = require("../../../shared/errors/AppError");
const { can } = require("../../../shared/access/can");
const { ActivityService } = require("../../activity/services/activity.service");

export class ServiceDeskAiService {
  static Instance = new ServiceDeskAiService();

  constructor(
    private readonly ai = AiService.Instance,
    private readonly requests = ServiceRequestRepository.Instance,
    private readonly automationRepo = AutomationRepository.Instance,
    private readonly desk = ServiceDeskService.Instance,
    private readonly activity = ActivityService.Instance
  ) {}

  // "Describe what you need" → the item that fits and its form pre-filled.
  // Only items the person could pick themselves are offered to the model.
  async intake(actor: DeskActor, description: string) {
    if (!can(actor, PERMS.CREATE)) throw new AppError("You do not have permission to do this", 403);
    const categories = await this.desk.portalCatalog(actor);
    const catalog: CatalogEntry[] = categories.flatMap((c) =>
      c.items.map((i) => ({ id: i.id, name: i.name, category: c.name, description: i.description, formSchema: i.formSchema }))
    );
    if (!catalog.length) throw new AppError("The catalog is empty — there's nothing to suggest yet", 409);

    const result = await this.ai.generateJson(actor, {
      feature: "service_request_intake",
      system: INTAKE_SYSTEM_PROMPT,
      prompt: buildIntakePrompt(description, catalog),
      schema: intakeReplySchema,
      schemaName: "it_request_intake",
      jsonSchema: intakeJsonSchema as unknown as Record<string, unknown>,
      maxOutputTokens: 4000,
    });
    const suggestion = finishIntake(result.data, catalog);
    const entry = suggestion.itemId ? catalog.find((i) => i.id === suggestion.itemId) : null;
    return {
      ...suggestion,
      item: entry ? { id: entry.id, name: entry.name, categoryName: entry.category } : null,
      provider: result.provider,
      model: result.model,
      creditsCharged: result.creditsCharged,
    };
  }

  // An advisory read of a request for the people deciding or doing it.
  async triage(actor: DeskActor, id: string): Promise<AiTriage> {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    const r = await this.requests.findRow(organizationId, id);
    if (!r || r.status === "draft") throw new AppError("Request not found", 404);
    const allowed = can(actor, PERMS.WORK) || (await this.requests.isApprover(id, actor.id));
    if (!allowed) throw new AppError("Only approvers and IT can ask for an AI triage", 403);

    const past = r.catalogItemId ? await this.requests.pastForItem(organizationId, r.catalogItemId, id) : [];
    const fields = new Map((r.itemSnapshot.formSchema ?? []).map((f) => [f.key, f]));
    const result = await this.ai.generateJson(actor, {
      feature: "service_request_triage",
      system: TRIAGE_SYSTEM_PROMPT,
      prompt: buildTriagePrompt({
        reference: formatReference(r.requestNumber),
        title: r.title,
        item: r.itemSnapshot.name,
        category: r.itemSnapshot.categoryName,
        riskLevel: r.riskLevel ?? "low",
        priority: r.priority,
        status: STATUS_LABELS[r.status],
        requester: r.requesterName,
        requestedFor: r.requestedForUserName ?? r.requestedForName ?? null,
        description: r.description,
        businessJustification: r.businessJustification,
        answers: Object.entries(r.formValues ?? {}).map(([k, v]) => ({
          label: fields.get(k)?.label ?? k,
          value: answerText(fields.get(k), v),
        })),
        past: past.map((p) => ({
          reference: formatReference(p.requestNumber),
          title: p.title,
          outcome: STATUS_LABELS[p.status as keyof typeof STATUS_LABELS] ?? p.status,
          note: p.rejectionComment ?? p.resolutionNote,
        })),
      }),
      schema: triageReplySchema,
      schemaName: "it_request_triage",
      jsonSchema: triageJsonSchema as unknown as Record<string, unknown>,
      maxOutputTokens: 3000,
    });

    const triage: AiTriage = {
      ...finishTriage(result.data),
      generatedAt: new Date().toISOString(),
      generatedById: actor.id,
      generatedByName: [actor.firstName, actor.lastName].filter(Boolean).join(" ") || actor.email || "Someone",
      model: result.model,
    };
    await this.requests.run(async (m) => {
      await this.requests.update(m, id, { aiTriage: triage });
      await this.automationRepo.addRun(
        {
          organizationId,
          requestId: id,
          kind: "ai_triage",
          status: "succeeded",
          detail: { suggestion: triage.suggestion, model: triage.model, provider: result.provider },
          initiatedById: actor.id,
          finishedAt: new Date(),
        },
        m
      );
      await this.requests.addAudit(
        m,
        this.activity.buildEntry(actor, {
          action: "service_request.ai_triage",
          summary: `Asked AI to triage IT request ${formatReference(r.requestNumber)} (suggestion: ${triage.suggestion.replace(/_/g, " ")})`,
          entityType: "service_request",
          entityId: id,
        })
      );
    });
    return triage;
  }
}
