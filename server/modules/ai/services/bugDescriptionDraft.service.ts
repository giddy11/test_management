// modules/ai/services/bugDescriptionDraft.service.ts
// "Suggest description" on the bug form (feature: bug_report_draft).
//
// Access is exactly what filing the bug needs: the caller must be able to
// contribute to the project (ProjectService.assertCanContribute, as
// BugService.createBug does). Everything else the AI reads comes through the
// app's own access-checked services, so it never sees what the caller can't:
//   - the project's description            ProjectService.getProject
//   - the related test case                TestCaseService.getTestCase
//   - the suite (from the case or picker)  TestSuiteService.getTestSuite
//   - up to 3 similar earlier bugs         TicketLinkService.findSimilar → BugService.getAccessible
// Feature requests and customer feedback tickets are deliberately not sent.
//
// Nothing is saved here. The suggestion fills the form; the tester files the bug.
import { ProjectService } from "../../project/services/project.service";
import { TicketLinkService } from "../../ticketLink/services/ticketLink.service";
import { AiService } from "./ai.service";
import {
  BUG_DESCRIPTION_SYSTEM_PROMPT,
  bugDescriptionJsonSchema,
  bugDescriptionReplySchema,
  buildBugDescriptionPrompt,
  finishBugDescription,
  type BugDescriptionInput,
} from "../domain/bugDescriptionDraft";
import type { BugDescriptionDraftDTO } from "../dto/ai.dto";
import type { BugDescriptionDraftBody } from "../validators/ai.schema";
import type { Actor } from "../../../shared/types/actor";

const { AppError } = require("../../../shared/errors/AppError");
const { TestCaseService } = require("../../testCase/services/testCase.service");
const { BugService } = require("../../bug/services/bug.service");

const MAX_SIMILAR_BUGS = 3;

type SuiteContext = BugDescriptionInput["suite"];
type SimilarBug = NonNullable<BugDescriptionInput["similarBugs"]>[number];

export class BugDescriptionDraftService {
  static Instance = new BugDescriptionDraftService();

  constructor(
    private readonly ai: AiService = AiService.Instance,
    private readonly projects: ProjectService = ProjectService.Instance,
    private readonly testCases = TestCaseService.Instance,
    private readonly ticketLinks: Pick<TicketLinkService, "findSimilar"> = TicketLinkService.Instance,
    private readonly bugs = BugService.Instance
  ) {}

  async draft(actor: Actor, body: BugDescriptionDraftBody): Promise<BugDescriptionDraftDTO> {
    // Same gate as reporting the bug: a read-only viewer can't raise one, so
    // can't draft one either. Fails before any credits are spent.
    const project = await this.projects.getProject(actor, body.projectId);
    await this.projects.assertCanContribute(actor, body.projectId);

    let testCase: BugDescriptionInput["testCase"] = null;
    let suite: SuiteContext = null;
    if (body.testCaseId) {
      // A picked test case must be readable — failing loudly here is right,
      // since the tester explicitly chose it.
      const tc = await this.testCases.getTestCase(actor, body.testCaseId);
      const tcSuite = await this.testCases.suiteService.getTestSuite(actor, tc.suiteId);
      if (tcSuite.projectId !== body.projectId) {
        throw new AppError("Related test case does not belong to this project", 422);
      }
      testCase = {
        title: tc.title,
        description: tc.description ?? null,
        steps: tc.steps ?? [],
        expectedResult: tc.expectedResult ?? "",
      };
      suite = { name: tcSuite.name, description: tcSuite.description ?? null };
    } else if (body.suiteId) {
      suite = await this.suiteContext(actor, body.suiteId, body.projectId);
    }

    const similarBugs = await this.similarBugs(actor, body);

    const result = await this.ai.generateJson(actor, {
      feature: "bug_report_draft",
      projectId: body.projectId,
      system: BUG_DESCRIPTION_SYSTEM_PROMPT,
      prompt: buildBugDescriptionPrompt({
        title: body.title,
        currentDescription: body.description,
        stepsToReproduce: body.stepsToReproduce?.filter((s) => s.length > 0),
        expectedBehavior: body.expectedBehavior,
        actualBehavior: body.actualBehavior,
        environment: body.environment,
        projectDescription: project?.description ?? null,
        suite,
        testCase,
        similarBugs,
      }),
      schema: bugDescriptionReplySchema,
      schemaName: "bug_description",
      jsonSchema: bugDescriptionJsonSchema as unknown as Record<string, unknown>,
      maxOutputTokens: 4000,
      rejectionHints: [
        {
          includes: "the description was empty",
          message: "The AI couldn't write a description from this title. Add a few more words to the title and try again.",
        },
      ],
    });

    return {
      ...finishBugDescription(result.data),
      provider: result.provider,
      model: result.model,
      creditsCharged: result.creditsCharged,
    };
  }

  // The suite picked in the form (no test case chosen). Context, not a
  // requirement: if it can't be read, the suggestion goes ahead without it.
  private async suiteContext(actor: Actor, suiteId: string, projectId: string): Promise<SuiteContext> {
    try {
      const s = await this.testCases.suiteService.getTestSuite(actor, suiteId);
      return s.projectId === projectId ? { name: s.name, description: s.description ?? null } : null;
    } catch {
      return null;
    }
  }

  // Earlier bugs in this project whose titles read like this one — the same
  // search as the form's "has this been reported before?" panel. Only bugs;
  // each re-read through BugService so the usual access check applies. Any
  // failure here just means fewer examples, never a failed suggestion.
  private async similarBugs(actor: Actor, body: BugDescriptionDraftBody): Promise<SimilarBug[]> {
    try {
      const matches = await this.ticketLinks.findSimilar(actor, {
        projectId: body.projectId,
        title: body.title,
        // When editing, the bug itself would be its own best match.
        ...(body.bugId ? { excludeType: "bug" as const, excludeId: body.bugId } : {}),
      });
      const ids = matches
        .filter((m) => m.type === "bug")
        .slice(0, MAX_SIMILAR_BUGS)
        .map((m) => m.id);
      const loaded = await Promise.all(
        ids.map((id) => this.bugs.getAccessible(actor, id).catch(() => null))
      );
      return loaded
        .filter((b): b is { title: string; description: string | null; status: string } => b !== null)
        .map((b) => ({ title: b.title, description: b.description ?? null, status: b.status }));
    } catch (err) {
      console.warn("[ai] similar bugs unavailable for the description draft:", err instanceof Error ? err.message : err);
      return [];
    }
  }
}
