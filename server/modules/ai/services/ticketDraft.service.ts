// modules/ai/services/ticketDraft.service.ts
// The AI Bug & Feature Request Assistant: turns the user's own words into a
// structured draft of the bug or feature-request form, with follow-up
// questions and the fields that are the AI's suggestion marked as such.
//
// Access is exactly what filing the ticket needs (DraftContextService
// .assertCanDraft, the same check BugService / FeatureRequestService use), and
// all background comes through access-checked services. Nothing is saved:
// the draft fills the form, and the user files it the ordinary way.
import { AiService } from "./ai.service";
import { DraftContextService } from "./draftContext.service";
import {
  BUG_REPORT_SYSTEM_PROMPT,
  bugReportJsonSchema,
  bugReportReplySchema,
  buildBugReportPrompt,
  finishBugReport,
} from "../domain/bugReportDraft";
import {
  FEATURE_REQUEST_SYSTEM_PROMPT,
  featureRequestJsonSchema,
  featureRequestReplySchema,
  buildFeatureRequestPrompt,
  finishFeatureRequest,
} from "../domain/featureRequestDraft";
import type { SuiteContext, TestCaseContext } from "../domain/draftContext";
import type { BugReportDraftDTO, FeatureRequestDraftDTO } from "../dto/ai.dto";
import type { BugReportDraftBody, FeatureRequestDraftBody } from "../validators/ai.schema";
import type { Actor } from "../../../shared/types/actor";

// Used to find similar earlier tickets: the title if there is one, else the
// start of what the user wrote.
const searchTitle = (title: string | undefined, rough: string | undefined) =>
  (title?.trim() || rough?.trim().split(/\n/)[0] || "").slice(0, 200);

export class TicketDraftService {
  static Instance = new TicketDraftService();

  constructor(
    private readonly ai: AiService = AiService.Instance,
    private readonly context: DraftContextService = DraftContextService.Instance
  ) {}

  async bugReport(actor: Actor, body: BugReportDraftBody): Promise<BugReportDraftDTO> {
    const project = await this.context.assertCanDraft(actor, body.projectId);

    let testCase: TestCaseContext | null = null;
    let suite: SuiteContext | null = null;
    if (body.testCaseId) {
      ({ testCase, suite } = await this.context.testCase(actor, body.testCaseId, body.projectId));
    } else if (body.suiteId) {
      suite = await this.context.suite(actor, body.suiteId, body.projectId);
    }
    const similar = await this.context.similarBugs(actor, {
      projectId: body.projectId,
      title: searchTitle(body.form.title, body.roughDescription),
      excludeId: body.bugId,
    });

    const result = await this.ai.generateJson(actor, {
      feature: "bug_report_draft",
      projectId: body.projectId,
      system: BUG_REPORT_SYSTEM_PROMPT,
      prompt: buildBugReportPrompt({
        roughDescription: body.roughDescription,
        form: { ...body.form, stepsToReproduce: body.form.stepsToReproduce?.filter((s) => s.length > 0) },
        answers: body.answers,
        projectDescription: project.description,
        suite,
        testCase,
        similar,
      }),
      schema: bugReportReplySchema,
      schemaName: "bug_report",
      jsonSchema: bugReportJsonSchema as unknown as Record<string, unknown>,
      maxOutputTokens: 8000,
      rejectionHints: [
        {
          includes: "was empty",
          message: "The AI couldn't write a report from that. Add a sentence or two about what went wrong and try again.",
        },
      ],
    });

    return { ...finishBugReport(result.data), provider: result.provider, model: result.model, creditsCharged: result.creditsCharged };
  }

  async featureRequest(actor: Actor, body: FeatureRequestDraftBody): Promise<FeatureRequestDraftDTO> {
    const project = await this.context.assertCanDraft(actor, body.projectId);
    const suite = body.suiteId ? await this.context.suite(actor, body.suiteId, body.projectId) : null;
    const similar = await this.context.similarFeatureRequests(actor, {
      projectId: body.projectId,
      title: searchTitle(body.form.title, body.roughDescription),
      excludeId: body.requestId,
    });

    const result = await this.ai.generateJson(actor, {
      feature: "feature_request_draft",
      projectId: body.projectId,
      system: FEATURE_REQUEST_SYSTEM_PROMPT,
      prompt: buildFeatureRequestPrompt({
        roughDescription: body.roughDescription,
        form: body.form,
        answers: body.answers,
        projectDescription: project.description,
        suite,
        similar,
      }),
      schema: featureRequestReplySchema,
      schemaName: "feature_request",
      jsonSchema: featureRequestJsonSchema as unknown as Record<string, unknown>,
      maxOutputTokens: 8000,
      rejectionHints: [
        {
          includes: "was empty",
          message: "The AI couldn't shape a request from that. Add a sentence or two about what you'd like and why, then try again.",
        },
      ],
    });

    return { ...finishFeatureRequest(result.data), provider: result.provider, model: result.model, creditsCharged: result.creditsCharged };
  }
}
