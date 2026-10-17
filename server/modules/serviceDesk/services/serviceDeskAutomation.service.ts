// modules/serviceDesk/services/serviceDeskAutomation.service.ts
// Story 2: automation rules, fulfilment connectors, and the interventions IT
// makes when automation can't or shouldn't carry on.
//
// The webhook lifecycle, per request:
//   reaches IT ─▶ checks (not flagged, identity confirmed if needed, connector
//   on, approvals complete) ─▶ in progress, automationStatus "running", run
//   "pending" ─▶ deliver ─▶ { succeeded | failed | accepted (await callback)
//   | retry in 1, 5, 15 min } ─▶ fulfilled automatically, or failed: flagged
//   for review, IT told, and an agent retries or takes it over.
// Every step writes an automation-run row; nothing here touches approvals.
import { createHash, randomBytes, randomUUID, timingSafeEqual, createHmac } from "crypto";
import type { EntityManager } from "typeorm";
import { AutomationRepository } from "../repositories/automation.repository";
import { ServiceRequestRepository, type RequestRow } from "../repositories/serviceRequest.repository";
import { ServiceDeskRepository } from "../repositories/serviceDesk.repository";
import { ServiceDeskService, PERMS, type DeskActor } from "./serviceDesk.service";
import { ServiceDeskNotifier } from "./serviceDeskNotifier";
import type { ServiceAutomationRun } from "../entities/serviceAutomationRun.entity";
import type { ServiceWebhookEndpoint } from "../entities/serviceWebhookEndpoint.entity";
import {
  autoApprovalRefusal,
  evaluateRules,
  ruleMatches,
  type RuleActions,
  type RuleConditions,
  type RuleOutcome,
  type RuleSubject,
} from "../domain/automationRules";
import {
  CALLBACK_TIMEOUT_HOURS,
  DELIVERY_TIMEOUT_MS,
  MAX_ATTEMPTS,
  checkWebhookUrl,
  classifyResponse,
  nextAttemptAt,
  signature,
  type CallbackBody,
} from "../domain/fulfilment";
import { READY_FOR_FULFILMENT, TERMINAL_STATUSES, formatReference } from "../domain/lifecycle";
import { open, seal } from "../../../shared/utils/secretBox";
import { isPrivateHost } from "../../../infrastructure/ai/serverAddress";
import { toRequestDto } from "../dto/serviceDesk.dto";

const { AppError } = require("../../../shared/errors/AppError");
const { can } = require("../../../shared/access/can");
const { env } = require("../../../config/env");
const { ActivityService } = require("../../activity/services/activity.service");

const SYSTEM_ACTOR = (organizationId: string) => ({ id: null, organizationId, role: null, name: "IT-request automation" });
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface RuleBody {
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  conditions: RuleConditions;
  actions: RuleActions;
}

export class ServiceDeskAutomationService {
  static Instance = new ServiceDeskAutomationService();

  constructor(
    private readonly repo = AutomationRepository.Instance,
    private readonly requests = ServiceRequestRepository.Instance,
    private readonly deskRepo = ServiceDeskRepository.Instance,
    private readonly desk = ServiceDeskService.Instance,
    private readonly notifier = ServiceDeskNotifier.Instance,
    private readonly activity = ActivityService.Instance
  ) {}

  // ── Rules: setup (serviceautomation.manage) ────────────────────────────────
  async listRules(actor: DeskActor) {
    const organizationId = this.desk.orgOf(actor);
    return this.repo.listRules(organizationId);
  }

  async saveRule(actor: DeskActor, id: string | null, body: Partial<RuleBody>) {
    const organizationId = this.desk.orgOf(actor);
    const existing = id ? await this.repo.findRule(organizationId, id) : null;
    if (id && !existing) throw new AppError("Rule not found", 404);
    if (!id && (!body.name || !body.actions)) throw new AppError("A rule needs a name and an action", 422);
    if (body.actions?.assignToId) {
      const agents = await this.deskRepo.usersWithPermission(organizationId, [PERMS.WORK]);
      if (!agents.some((a) => a.id === body.actions!.assignToId)) {
        throw new AppError("Assign to someone who works the IT queue", 422, [{ field: "actions.assignToId", message: "Pick an IT agent" }]);
      }
    }
    const saved = await this.repo.saveRule(
      organizationId,
      id,
      { ...body, ...(id ? {} : { createdById: actor.id }) },
      this.activity.buildEntry(actor, {
        action: id ? "service_automation_rule.updated" : "service_automation_rule.created",
        summary: `${id ? "Updated" : "Created"} the automation rule "${body.name ?? existing?.name}"`,
        entityType: "service_automation_rule",
        // A rule can approve requests on its own — always worth a second look.
        severity: (body.actions ?? existing?.actions)?.autoApprove ? "critical" : "warning",
        metadata: { conditions: body.conditions, actions: body.actions, isActive: body.isActive },
      })
    );
    return saved;
  }

  async deleteRule(actor: DeskActor, id: string) {
    const organizationId = this.desk.orgOf(actor);
    const existing = await this.repo.findRule(organizationId, id);
    if (!existing) throw new AppError("Rule not found", 404);
    await this.repo.deleteRule(
      organizationId,
      id,
      this.activity.buildEntry(actor, {
        action: "service_automation_rule.deleted",
        summary: `Deleted the automation rule "${existing.name}"`,
        entityType: "service_automation_rule",
        entityId: id,
      })
    );
  }

  // Which of the last 50 submitted requests a draft rule would have matched,
  // and what it would have done — before anyone switches it on.
  async dryRun(actor: DeskActor, conditions: RuleConditions, actions: RuleActions) {
    const organizationId = this.desk.orgOf(actor);
    const { data } = await this.requests.list({
      organizationId,
      userId: actor.id,
      scope: "queue",
      page: 1,
      limit: 50,
    });
    const items = new Map((await this.deskRepo.listItems(organizationId, false)).map((i) => [i.id, i]));
    const matches = (data as RequestRow[])
      .filter((r) => ruleMatches(conditions, subjectOf(r)))
      .map((r) => {
        const item = r.catalogItemId ? items.get(r.catalogItemId) : undefined;
        const refusal = actions.autoApprove
          ? r.itemSnapshot.approvalMode === "none"
            ? "needs no approval anyway"
            : item
              ? autoApprovalRefusal(item, !!actions.flagForReview)
              : "the item no longer exists"
          : null;
        return {
          id: r.id,
          reference: formatReference(r.requestNumber),
          title: r.title,
          item: r.itemSnapshot.name,
          wouldAutoApprove: actions.autoApprove ? refusal === null : null,
          autoApproveRefusal: refusal,
        };
      });
    return { checked: data.length, matched: matches.length, matches };
  }

  // ── Rules: at submit ───────────────────────────────────────────────────────
  async evaluate(organizationId: string, subject: RuleSubject): Promise<RuleOutcome> {
    const rules = await this.repo.listRules(organizationId, true);
    return evaluateRules(rules, subject);
  }

  // The run rows for what the rules did — written in the submit transaction.
  async recordRuleRuns(
    m: EntityManager,
    organizationId: string,
    requestId: string,
    outcome: RuleOutcome,
    autoApproval: { requested: boolean; refusal: string | null; by: string | null } | null,
    initiatedById: string
  ) {
    for (const rule of outcome.matched) {
      await this.repo.addRun(
        {
          organizationId,
          requestId,
          kind: "rule",
          status: "succeeded",
          ruleId: rule.id,
          ruleName: rule.name,
          detail: { actions: rule.actions },
          initiatedById,
          finishedAt: new Date(),
        },
        m
      );
    }
    if (autoApproval?.requested) {
      await this.repo.addRun(
        {
          organizationId,
          requestId,
          kind: "auto_approve",
          status: autoApproval.refusal ? "skipped" : "succeeded",
          ruleName: autoApproval.by,
          detail: autoApproval.refusal ? { reason: autoApproval.refusal } : { approvedBy: autoApproval.by },
          initiatedById,
          finishedAt: new Date(),
        },
        m
      );
    }
  }

  // ── Connectors: setup (serviceautomation.manage) ───────────────────────────
  private secretKey(): string {
    if (!env.ai.configured) {
      throw new AppError(
        "This server has no key for storing secrets (AI_KEYS_SECRET). Ask whoever runs TestMate to set it, then add the connector.",
        409
      );
    }
    return env.ai.keysSecret;
  }

  private ctx(e: { organizationId: string; id: string }, part: "url" | "secret") {
    return `${e.organizationId}:service-webhook:${e.id}:${part}`;
  }

  async listEndpoints(actor: DeskActor) {
    const organizationId = this.desk.orgOf(actor);
    return (await this.repo.listEndpoints(organizationId)).map(toEndpointDto);
  }

  async createEndpoint(actor: DeskActor, body: { name: string; url: string }) {
    const organizationId = this.desk.orgOf(actor);
    const key = this.secretKey();
    const checked = checkWebhookUrl(body.url, !env.isProduction, isPrivateHost);
    if ("problem" in checked) throw new AppError(checked.problem, 422, [{ field: "url", message: checked.problem }]);
    if (await this.repo.endpointNameTaken(organizationId, body.name)) throw new AppError("There's already a connector with that name", 409);
    const id = randomUUID();
    const secret = randomBytes(32).toString("hex");
    const saved = await this.repo.saveEndpoint(
      organizationId,
      null,
      {
        id,
        name: body.name,
        urlDisplay: checked.display,
        urlSealed: seal(checked.url, key, this.ctx({ organizationId, id }, "url")),
        secretSealed: seal(secret, key, this.ctx({ organizationId, id }, "secret")),
        isActive: true,
        createdById: actor.id,
      },
      this.activity.buildEntry(actor, {
        action: "service_webhook_endpoint.created",
        summary: `Added the fulfilment connector "${body.name}" (${checked.display})`,
        entityType: "service_webhook_endpoint",
        severity: "warning",
      })
    );
    // The signing secret is shown once, here, and never again.
    return { endpoint: toEndpointDto({ ...saved, itemCount: 0 }), secret };
  }

  async updateEndpoint(actor: DeskActor, id: string, body: { name?: string; url?: string; isActive?: boolean }) {
    const organizationId = this.desk.orgOf(actor);
    const existing = await this.repo.findEndpoint(organizationId, id);
    if (!existing) throw new AppError("Connector not found", 404);
    const patch: Partial<ServiceWebhookEndpoint> = {};
    if (body.name !== undefined) {
      if (await this.repo.endpointNameTaken(organizationId, body.name, id)) throw new AppError("There's already a connector with that name", 409);
      patch.name = body.name;
    }
    if (body.url !== undefined) {
      const checked = checkWebhookUrl(body.url, !env.isProduction, isPrivateHost);
      if ("problem" in checked) throw new AppError(checked.problem, 422, [{ field: "url", message: checked.problem }]);
      patch.urlDisplay = checked.display;
      patch.urlSealed = seal(checked.url, this.secretKey(), this.ctx(existing, "url"));
    }
    if (body.isActive !== undefined) patch.isActive = body.isActive;
    const saved = await this.repo.saveEndpoint(
      organizationId,
      id,
      patch,
      this.activity.buildEntry(actor, {
        action: "service_webhook_endpoint.updated",
        summary: `Updated the fulfilment connector "${patch.name ?? existing.name}"`,
        entityType: "service_webhook_endpoint",
        severity: "warning",
        metadata: { changed: Object.keys(body) },
      })
    );
    return toEndpointDto({ ...saved, itemCount: 0 });
  }

  async rotateSecret(actor: DeskActor, id: string) {
    const organizationId = this.desk.orgOf(actor);
    const existing = await this.repo.findEndpoint(organizationId, id);
    if (!existing) throw new AppError("Connector not found", 404);
    const secret = randomBytes(32).toString("hex");
    await this.repo.saveEndpoint(
      organizationId,
      id,
      { secretSealed: seal(secret, this.secretKey(), this.ctx(existing, "secret")) },
      this.activity.buildEntry(actor, {
        action: "service_webhook_endpoint.secret_rotated",
        summary: `Replaced the signing secret of "${existing.name}"`,
        entityType: "service_webhook_endpoint",
        severity: "warning",
      })
    );
    return { secret };
  }

  async deleteEndpoint(actor: DeskActor, id: string) {
    const organizationId = this.desk.orgOf(actor);
    const existing = (await this.repo.listEndpoints(organizationId)).find((e) => e.id === id);
    if (!existing) throw new AppError("Connector not found", 404);
    if (existing.itemCount > 0) {
      throw new AppError(
        `${existing.itemCount} catalog item${existing.itemCount === 1 ? " uses" : "s use"} this connector. Switch ${existing.itemCount === 1 ? "it" : "them"} to another way of fulfilling first.`,
        409
      );
    }
    await this.repo.deleteEndpoint(
      organizationId,
      id,
      this.activity.buildEntry(actor, {
        action: "service_webhook_endpoint.deleted",
        summary: `Deleted the fulfilment connector "${existing.name}"`,
        entityType: "service_webhook_endpoint",
        entityId: id,
      })
    );
  }

  // Sends a signed "ping" so an admin can see the connector answering.
  async testEndpoint(actor: DeskActor, id: string) {
    const organizationId = this.desk.orgOf(actor);
    const endpoint = await this.repo.findEndpoint(organizationId, id);
    if (!endpoint) throw new AppError("Connector not found", 404);
    const opened = this.openEndpoint(endpoint);
    if (!opened) throw new AppError("This connector's stored address or secret can't be read. Replace the address and the secret.", 409);
    const body = JSON.stringify({ event: "ping", deliveryId: randomUUID(), sentAt: new Date().toISOString() });
    const started = Date.now();
    const res = await this.post(opened.url, opened.secret, "ping", randomUUID(), body);
    const ok = res.status >= 200 && res.status < 300;
    await this.repo.noteEndpointResult(id, ok, ok ? undefined : res.error ?? `HTTP ${res.status}`);
    return { ok, status: res.status, error: res.error ?? null, ms: Date.now() - started };
  }

  private openEndpoint(e: ServiceWebhookEndpoint): { url: string; secret: string } | null {
    if (!env.ai.configured) return null;
    const url = open(e.urlSealed, env.ai.keysSecret, this.ctx(e, "url"));
    const secret = open(e.secretSealed, env.ai.keysSecret, this.ctx(e, "secret"));
    return url && secret ? { url, secret } : null;
  }

  // ── Runs log ───────────────────────────────────────────────────────────────
  async listRuns(actor: DeskActor, q: { status?: ServiceAutomationRun["status"]; kind?: ServiceAutomationRun["kind"]; page: number; limit: number }) {
    const organizationId = this.desk.orgOf(actor);
    return this.repo.listRuns(organizationId, q);
  }

  // ── Webhook fulfilment ─────────────────────────────────────────────────────

  // Called whenever a request reaches IT (submitted with no approval, finally
  // approved, review cleared, identity confirmed). Does nothing unless its
  // item is fulfilled by a webhook; refuses — with a recorded reason — when a
  // safety check fails, leaving the request in the queue for a person.
  async onReachedIt(organizationId: string, requestId: string, initiatedById: string | null): Promise<void> {
    const r = await this.requests.findRow(organizationId, requestId);
    if (!r || r.itemSnapshot.fulfilmentType !== "webhook") return;
    if (!READY_FOR_FULFILMENT.includes(r.status) || r.automationStatus === "running" || r.automationStatus === "manual") return;

    const refuse = (reason: string, flag = false) => this.refuseAutomation(r, reason, flag, initiatedById);
    if (r.needsReview) return refuse("it's flagged for review");
    if (r.itemSnapshot.requiresIdentityCheck && !r.identityVerifiedAt) return refuse("IT hasn't recorded the identity check yet");
    const endpoint = r.itemSnapshot.endpointId ? await this.repo.findEndpoint(organizationId, r.itemSnapshot.endpointId) : null;
    if (!endpoint) return refuse("its connector no longer exists", true);
    if (!endpoint.isActive) return refuse(`the connector "${endpoint.name}" is switched off`, true);
    if (!this.openEndpoint(endpoint)) return refuse(`the connector "${endpoint.name}" can't be used (its stored secret can't be read)`, true);

    const token = this.callbackToken(requestId);
    let runId: string | null = null;
    await this.requests.run(async (m) => {
      const locked = await this.requests.lock(m, organizationId, requestId);
      if (!locked || !READY_FOR_FULFILMENT.includes(locked.status) || locked.automationStatus === "running") return;
      // Belt and braces: never start while any approval is outstanding (BR 2.4).
      const approvals = await this.requests.approvalsOf(m, requestId);
      if (approvals.some((a) => a.decision === "pending" || a.decision === "waiting" || a.decision === "rejected")) return;
      const now = new Date();
      const run = await this.repo.addRun(
        {
          organizationId,
          requestId,
          kind: "webhook",
          status: "pending",
          endpointId: endpoint.id,
          attempt: 0,
          callbackTokenHash: null,
          initiatedById,
        },
        m
      );
      runId = run.id;
      await this.repo.updateRun(run.id, { callbackTokenHash: sha256(token(run.id)) }, m);
      await this.requests.update(m, requestId, {
        status: "in_progress",
        startedAt: now,
        statusUpdatedAt: now,
        automationStatus: "running",
      });
      await this.requests.addHistory(m, {
        requestId,
        fromStatus: locked.status,
        toStatus: "in_progress",
        actorId: initiatedById,
        note: `Sent to "${endpoint.name}" for automatic fulfilment`,
      });
      await this.requests.addAudit(
        m,
        this.activity.buildEntry(SYSTEM_ACTOR(organizationId), {
          action: "service_request.automation_started",
          summary: `Sent IT request ${formatReference(locked.requestNumber)} to "${endpoint.name}"`,
          entityType: "service_request",
          entityId: requestId,
          metadata: { runId: run.id, initiatedById },
        })
      );
    });
    if (runId) await this.deliver(runId);
  }

  private async refuseAutomation(r: RequestRow, reason: string, flag: boolean, initiatedById: string | null) {
    await this.repo.addRun({
      organizationId: r.organizationId,
      requestId: r.id,
      kind: "webhook",
      status: "skipped",
      detail: { reason },
      initiatedById,
      finishedAt: new Date(),
    });
    if (flag) {
      await this.requests.run(async (m) => {
        await this.requests.update(m, r.id, { needsReview: true, reviewReason: `Automatic fulfilment didn't start: ${reason}` });
      });
      this.notifyAgents(r, "Automation didn't start", `Automatic fulfilment of "${r.title}" didn't start: ${reason}. It's waiting in the queue.`);
    }
  }

  // The callback token is derived, not stored, so a retry can send the same
  // callback URL; only its hash is kept on the run.
  private callbackToken(requestId: string) {
    return (runId: string) =>
      createHmac("sha256", env.ai.keysSecret || "dev-only").update(`service-callback:${requestId}:${runId}`).digest("hex");
  }

  // One delivery attempt of a pending or retrying run.
  async deliver(runId: string): Promise<void> {
    const run = await this.repo.findRun(runId);
    if (!run || (run.status !== "pending" && run.status !== "retrying")) return;
    const r = await this.requests.findRow(run.organizationId, run.requestId);
    const endpoint = run.endpointId ? await this.repo.findEndpoint(run.organizationId, run.endpointId) : null;
    const opened = endpoint ? this.openEndpoint(endpoint) : null;
    if (!r || !endpoint || !opened) {
      await this.complete(runId, { ok: false, error: "The connector is gone or its secret can't be read" });
      return;
    }

    const body = JSON.stringify(this.payload(r, run, this.callbackToken(r.id)(run.id)));
    const res = await this.post(opened.url, opened.secret, "service_request.fulfil", run.id, body);
    const outcome = classifyResponse(res.status, res.json, res.error);
    const attempt = run.attempt + 1;

    if (outcome.kind === "succeeded") {
      await this.repo.updateRun(runId, { attempt });
      await this.repo.noteEndpointResult(endpoint.id, true);
      await this.complete(runId, { ok: true, note: outcome.note });
    } else if (outcome.kind === "failed") {
      await this.repo.updateRun(runId, { attempt });
      await this.repo.noteEndpointResult(endpoint.id, false, outcome.error);
      await this.complete(runId, { ok: false, error: outcome.error });
    } else if (outcome.kind === "accepted") {
      await this.repo.updateRun(runId, { attempt, status: "pending", nextAttemptAt: null, error: null, detail: { acceptedAt: new Date().toISOString(), httpStatus: res.status } });
      await this.repo.noteEndpointResult(endpoint.id, true);
    } else {
      await this.repo.noteEndpointResult(endpoint.id, false, outcome.error);
      const next = attempt < MAX_ATTEMPTS ? nextAttemptAt(attempt, new Date()) : null;
      if (next) {
        await this.repo.updateRun(runId, { attempt, status: "retrying", nextAttemptAt: next, error: outcome.error });
      } else {
        await this.repo.updateRun(runId, { attempt });
        await this.complete(runId, { ok: false, error: `Gave up after ${attempt} attempts: ${outcome.error}` });
      }
    }
  }

  private payload(r: RequestRow, run: ServiceAutomationRun, token: string) {
    const labels = new Map((r.itemSnapshot.formSchema ?? []).map((f) => [f.key, f.label]));
    return {
      event: "service_request.fulfil",
      deliveryId: run.id,
      attempt: run.attempt + 1,
      callbackUrl: `${env.appBaseUrl}/api/v1/public/service-desk/callbacks/${run.id}/${token}`,
      request: {
        id: r.id,
        reference: formatReference(r.requestNumber),
        title: r.title,
        description: r.description,
        businessJustification: r.businessJustification,
        priority: r.priority,
        riskLevel: r.riskLevel,
        category: r.itemSnapshot.categoryName,
        categoryKey: r.itemSnapshot.categoryKey,
        item: r.itemSnapshot.name,
        itemId: r.itemSnapshot.itemId,
        answers: r.formValues,
        answerLabels: Object.fromEntries(Object.keys(r.formValues ?? {}).map((k) => [k, labels.get(k) ?? k])),
        requester: { name: r.requesterName, email: r.requesterEmail },
        requestedFor: r.requestedForId
          ? { name: r.requestedForUserName, email: r.requestedForUserEmail, newStarter: false }
          : r.requestedForName
            ? { name: r.requestedForName, email: r.requestedForEmail, newStarter: true }
            : null,
        submittedAt: r.submittedAt,
        approvedAt: r.approvedAt,
        autoApproved: r.autoApproved,
      },
    };
  }

  // POSTs a signed body. status 0 = no response (network error or timeout).
  private async post(url: string, secret: string, event: string, deliveryId: string, body: string) {
    const ts = Math.floor(Date.now() / 1000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "TestMate-IT-Requests/1",
          "X-TestMate-Event": event,
          "X-TestMate-Delivery": deliveryId,
          "X-TestMate-Timestamp": String(ts),
          "X-TestMate-Signature": signature(secret, ts, body),
        },
        body,
        signal: controller.signal,
        redirect: "manual",
      });
      const text = await res.text().catch(() => "");
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { status: res.status, json, error: undefined as string | undefined };
    } catch (e) {
      const err = e as Error;
      return { status: 0, json: null, error: err.name === "AbortError" ? "The connector didn't answer within 10 seconds" : err.message };
    } finally {
      clearTimeout(timer);
    }
  }

  // Finishes a webhook run once — from the response, the callback or the
  // timeout, whichever comes first. Returns false if it was already final.
  async complete(runId: string, result: { ok: true; note: string | null } | { ok: false; error: string }): Promise<boolean> {
    let finished: { r: ServiceAutomationRun; reqTitle: string; endpointName: string } | null = null;
    await this.requests.run(async (m) => {
      const run = await this.repo.lockRun(m, runId);
      if (!run || (run.status !== "pending" && run.status !== "retrying")) return;
      const req = await this.requests.lock(m, run.organizationId, run.requestId);
      const endpoint = run.endpointId ? await this.repo.findEndpoint(run.organizationId, run.endpointId) : null;
      const endpointName = endpoint?.name ?? "the connector";
      const now = new Date();
      await this.repo.updateRun(
        runId,
        result.ok
          ? { status: "succeeded", finishedAt: now, nextAttemptAt: null, error: null, detail: { ...(run.detail ?? {}), note: result.note } }
          : { status: "failed", finishedAt: now, nextAttemptAt: null, error: result.error.slice(0, 500) },
        m
      );
      finished = { r: run, reqTitle: req?.title ?? "", endpointName };
      if (!req || req.automationStatus !== "running") return; // IT took over meanwhile

      if (result.ok && req.status === "in_progress") {
        await this.requests.update(m, req.id, {
          status: "fulfilled",
          fulfilledAt: now,
          statusUpdatedAt: now,
          automationStatus: "succeeded",
          fulfilledBy: "automation",
          resolutionNote: `Done automatically by ${endpointName}${result.note ? `: ${result.note}` : "."}`,
        });
        await this.requests.addHistory(m, {
          requestId: req.id,
          fromStatus: "in_progress",
          toStatus: "fulfilled",
          actorId: null,
          note: `Fulfilled automatically by ${endpointName}${result.note ? `: ${result.note}` : ""}`,
        });
        await this.requests.addAudit(
          m,
          this.activity.buildEntry(SYSTEM_ACTOR(req.organizationId), {
            action: "service_request.fulfilled",
            summary: `Fulfilled IT request ${formatReference(req.requestNumber)} automatically via "${endpointName}"`,
            entityType: "service_request",
            entityId: req.id,
            metadata: { runId, by: "automation" },
          })
        );
      } else if (!result.ok && !TERMINAL_STATUSES.includes(req.status)) {
        await this.requests.update(m, req.id, {
          automationStatus: "failed",
          needsReview: true,
          reviewReason: `Automatic fulfilment failed: ${result.error}`.slice(0, 500),
        });
        await this.requests.addComment(
          { requestId: req.id, authorId: null, isInternal: true, body: `Automatic fulfilment by ${endpointName} failed: ${result.error}` },
          m
        );
        await this.requests.addAudit(
          m,
          this.activity.buildEntry(SYSTEM_ACTOR(req.organizationId), {
            action: "service_request.automation_failed",
            summary: `Automatic fulfilment of IT request ${formatReference(req.requestNumber)} failed`,
            entityType: "service_request",
            entityId: req.id,
            severity: "warning",
            metadata: { runId, error: result.error },
          })
        );
      }
    });
    if (!finished) return false;

    const f = finished as { r: ServiceAutomationRun; reqTitle: string; endpointName: string };
    const r = await this.requests.findRow(f.r.organizationId, f.r.requestId);
    if (!r) return true;
    if (result.ok && r.status === "fulfilled") {
      const people = await this.deskRepo.peopleByIds(r.organizationId, [r.requesterId, r.requestedForId].filter(Boolean) as string[]);
      this.notifier.send(people, {
        kind: "update",
        requestId: r.id,
        organizationId: r.organizationId,
        title: `Done: ${formatReference(r.requestNumber)} ${r.title}`,
        heading: "Your IT request is fulfilled",
        body: `"${r.title}" was completed automatically.`,
        note: r.resolutionNote,
        noteLabel: "What was done",
        ctaLabel: "View the request",
      });
    } else if (!result.ok) {
      this.notifyAgents(r, "Automation failed", `Automatic fulfilment of "${r.title}" by ${f.endpointName} failed: ${result.error}. Retry it or handle it manually.`);
    }
    return true;
  }

  // POST /public/service-desk/callbacks/:runId/:token — the connector reports.
  async handleCallback(runId: string, token: string, body: CallbackBody) {
    const run = await this.repo.findRun(runId);
    const presented = sha256(String(token ?? ""));
    const valid =
      !!run?.callbackTokenHash &&
      presented.length === run.callbackTokenHash.length &&
      timingSafeEqual(Buffer.from(presented), Buffer.from(run.callbackTokenHash));
    if (!run || !valid) throw new AppError("Unknown or expired callback", 404);
    if (run.status !== "pending" && run.status !== "retrying") return { recorded: false, status: run.status };
    const done = await this.complete(
      runId,
      body.status === "succeeded" ? { ok: true, note: body.note ?? null } : { ok: false, error: body.note || "The connector reported a failure" }
    );
    if (body.externalReference) {
      await this.repo.updateRun(runId, { detail: { ...(run.detail ?? {}), externalReference: body.externalReference, note: body.note ?? null } });
    }
    return { recorded: done, status: body.status };
  }

  // The sweeper: retries that are due, and callbacks that never came.
  async processDue(): Promise<number> {
    let n = 0;
    for (const run of await this.repo.dueRetries(50)) {
      try {
        await this.deliver(run.id);
        n++;
      } catch (e) {
        console.error(`[serviceDesk] webhook retry ${run.id} failed:`, (e as Error).message);
      }
    }
    for (const run of await this.repo.staleCallbacks(CALLBACK_TIMEOUT_HOURS, 50)) {
      if (await this.complete(run.id, { ok: false, error: `No result reported within ${CALLBACK_TIMEOUT_HOURS} hours` })) n++;
    }
    return n;
  }

  // ── IT interventions (servicedesk.work) ────────────────────────────────────

  // Start automation now: after the review flag or a failure, or for the first
  // time once the identity check is done.
  async runNow(actor: DeskActor, id: string) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    const r = await this.mustFind(organizationId, id);
    if (r.itemSnapshot.fulfilmentType !== "webhook") throw new AppError("This request isn't fulfilled by a connector", 409);
    if (r.itemSnapshot.requiresIdentityCheck && !r.identityVerifiedAt) throw new AppError("Record the identity check first", 409);

    if (r.status === "in_progress" && r.automationStatus === "failed") {
      // A retry: same request, a fresh run.
      const token = this.callbackToken(id);
      let runId: string | null = null;
      await this.requests.run(async (m) => {
        const locked = await this.requests.lock(m, organizationId, id);
        if (!locked || locked.status !== "in_progress" || locked.automationStatus !== "failed") return;
        const run = await this.repo.addRun(
          { organizationId, requestId: id, kind: "webhook", status: "pending", endpointId: locked.itemSnapshot.endpointId ?? null, attempt: 0, initiatedById: actor.id },
          m
        );
        runId = run.id;
        await this.repo.updateRun(run.id, { callbackTokenHash: sha256(token(run.id)) }, m);
        await this.requests.update(m, id, { automationStatus: "running", needsReview: false, reviewReason: null });
        await this.requests.addAudit(
          m,
          this.activity.buildEntry(actor, {
            action: "service_request.automation_retried",
            summary: `Retried automatic fulfilment of IT request ${formatReference(locked.requestNumber)}`,
            entityType: "service_request",
            entityId: id,
          })
        );
      });
      if (!runId) throw new AppError("This request has moved on — refresh and try again", 409);
      await this.deliver(runId);
    } else if (READY_FOR_FULFILMENT.includes(r.status)) {
      await this.requests.run(async (m) => {
        await this.requests.update(m, id, { needsReview: false, reviewReason: null, automationStatus: null });
      });
      await this.onReachedIt(organizationId, id, actor.id);
    } else {
      throw new AppError("Automation can only start on a request that's ready for IT, or retry one that failed", 409);
    }
    return toRequestDto(await this.mustFind(organizationId, id));
  }

  // A person takes over from automation: no more automatic attempts.
  async takeOver(actor: DeskActor, id: string) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    await this.requests.run(async (m) => {
      const locked = await this.requests.lock(m, organizationId, id);
      if (!locked || locked.status === "draft") throw new AppError("Request not found", 404);
      if (TERMINAL_STATUSES.includes(locked.status)) throw new AppError("This request is already finished", 409);
      for (const run of await this.repo.openWebhookRuns(id, m)) {
        await this.repo.updateRun(run.id, { status: "skipped", finishedAt: new Date(), nextAttemptAt: null, error: `Taken over by ${nameOf(actor)}` }, m);
      }
      await this.requests.update(m, id, {
        automationStatus: "manual",
        needsReview: false,
        reviewReason: null,
        assigneeId: locked.assigneeId ?? actor.id,
      });
      await this.requests.addAudit(
        m,
        this.activity.buildEntry(actor, {
          action: "service_request.automation_taken_over",
          summary: `Took over IT request ${formatReference(locked.requestNumber)} from automation`,
          entityType: "service_request",
          entityId: id,
        })
      );
    });
    return toRequestDto(await this.mustFind(organizationId, id));
  }

  async clearReview(actor: DeskActor, id: string) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    await this.requests.run(async (m) => {
      const locked = await this.requests.lock(m, organizationId, id);
      if (!locked || locked.status === "draft") throw new AppError("Request not found", 404);
      if (!locked.needsReview) throw new AppError("This request isn't flagged for review", 409);
      await this.requests.update(m, id, { needsReview: false, reviewReason: null });
      await this.requests.addAudit(
        m,
        this.activity.buildEntry(actor, {
          action: "service_request.review_cleared",
          summary: `Reviewed IT request ${formatReference(locked.requestNumber)} and cleared the flag`,
          entityType: "service_request",
          entityId: id,
          metadata: { reason: locked.reviewReason },
        })
      );
    });
    // Cleared: if a connector fulfils it and it's waiting, it can go now.
    const r = await this.mustFind(organizationId, id);
    if (r.automationStatus !== "failed") await this.onReachedIt(organizationId, id, actor.id);
    return toRequestDto(await this.mustFind(organizationId, id));
  }

  // BR 1.5 / 2.5: how IT confirmed who is asking — before any work starts.
  async recordIdentityCheck(actor: DeskActor, id: string, method: string, note: string | null) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    await this.requests.run(async (m) => {
      const locked = await this.requests.lock(m, organizationId, id);
      if (!locked || locked.status === "draft") throw new AppError("Request not found", 404);
      if (TERMINAL_STATUSES.includes(locked.status)) throw new AppError("This request is already finished", 409);
      await this.requests.update(m, id, {
        identityVerifiedAt: new Date(),
        identityVerifiedById: actor.id,
        identityMethod: method,
        identityNote: note,
      });
      await this.requests.addAudit(
        m,
        this.activity.buildEntry(actor, {
          action: "service_request.identity_verified",
          summary: `Confirmed the requester's identity on IT request ${formatReference(locked.requestNumber)} (${method})`,
          entityType: "service_request",
          entityId: id,
          severity: "warning",
          metadata: { method },
        })
      );
    });
    await this.onReachedIt(organizationId, id, actor.id);
    return toRequestDto(await this.mustFind(organizationId, id));
  }

  // ── Self-service (deflect) ─────────────────────────────────────────────────

  // The person used the item's self-service link instead of asking IT. It's
  // recorded as a request fulfilled by self-service, so reporting sees it.
  async deflect(actor: DeskActor, itemId: string) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    const item = await this.deskRepo.findItem(organizationId, itemId);
    if (!item || !item.isActive) throw new AppError("That item is no longer in the catalog", 409);
    if (item.fulfilmentType !== "deflect" || !item.fulfilmentConfig?.url) throw new AppError("This item has no self-service link", 409);
    const category = await this.deskRepo.findCategory(organizationId, item.categoryId);
    const label = item.fulfilmentConfig.label || "the self-service link";
    const now = new Date();
    await this.requests.run(async (m) => {
      const row = await this.requests.insert(m, {
        organizationId,
        catalogItemId: item.id,
        itemSnapshot: {
          itemId: item.id,
          name: item.name,
          categoryKey: category?.key ?? "",
          categoryName: category?.name ?? "",
          formSchema: item.formSchema ?? [],
          approvalMode: item.approvalMode,
          version: item.version,
          riskLevel: item.riskLevel,
          fulfilmentType: "deflect",
        },
        requesterId: actor.id,
        title: item.name,
        priority: "medium",
        riskLevel: item.riskLevel,
        formValues: {},
        status: "fulfilled",
        submittedAt: now,
        fulfilledAt: now,
        statusUpdatedAt: now,
        fulfilledBy: "self_service",
        resolutionNote: `Used self-service: ${label}`,
      });
      await this.requests.addHistory(m, { requestId: row.id, fromStatus: null, toStatus: "fulfilled", actorId: actor.id, note: `Used ${label}` });
      await this.repo.addRun(
        { organizationId, requestId: row.id, kind: "deflect", status: "succeeded", detail: { url: item.fulfilmentConfig.url }, initiatedById: actor.id, finishedAt: now },
        m
      );
      await this.requests.addAudit(
        m,
        this.activity.buildEntry(actor, {
          action: "service_request.self_service",
          summary: `Used self-service for "${item.name}"`,
          entityType: "service_request",
          entityId: row.id,
        })
      );
    });
    return { url: item.fulfilmentConfig.url };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  canWork(actor: DeskActor) {
    return can(actor, PERMS.WORK);
  }

  private async mustFind(organizationId: string, id: string): Promise<RequestRow> {
    const r = await this.requests.findRow(organizationId, id);
    if (!r || r.status === "draft") throw new AppError("Request not found", 404);
    return r;
  }

  private notifyAgents(r: RequestRow, heading: string, body: string) {
    // The assignee if there is one, else the IT team (or the admins, if
    // there isn't one yet).
    const recipients = r.assigneeId
      ? this.deskRepo.peopleByIds(r.organizationId, [r.assigneeId]).then(async (p) => (p.length ? p : this.deskRepo.queueWatchers(r.organizationId)))
      : this.deskRepo.queueWatchers(r.organizationId);
    recipients
      .then((people) => {
        this.notifier.send(people, {
          kind: "escalated",
          requestId: r.id,
          organizationId: r.organizationId,
          title: `${heading}: ${formatReference(r.requestNumber)} ${r.title}`,
          heading,
          body,
          ctaLabel: "Open the request",
        });
      })
      .catch((e: Error) => console.error("[serviceDesk] automation notification failed:", e.message));
  }
}

// What a rule sees about a request.
export function subjectOf(r: Pick<RequestRow, "itemSnapshot" | "catalogItemId" | "priority" | "riskLevel" | "requestedForName" | "requestedForId" | "formValues" | "title" | "description">): RuleSubject {
  return {
    categoryKey: r.itemSnapshot.categoryKey,
    itemId: r.catalogItemId ?? r.itemSnapshot.itemId,
    priority: r.priority,
    riskLevel: r.riskLevel ?? "low",
    forNewStarter: !r.requestedForId && !!r.requestedForName,
    formValues: r.formValues ?? {},
    title: r.title,
    description: r.description,
  };
}

function toEndpointDto(e: ServiceWebhookEndpoint & { itemCount: number }) {
  return {
    id: e.id,
    name: e.name,
    urlDisplay: e.urlDisplay,
    isActive: e.isActive,
    lastSuccessAt: e.lastSuccessAt,
    lastFailureAt: e.lastFailureAt,
    lastFailure: e.lastFailure,
    itemCount: e.itemCount,
    createdAt: e.createdAt,
  };
}

function nameOf(actor: DeskActor): string {
  return [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim() || actor.email || "Someone";
}
