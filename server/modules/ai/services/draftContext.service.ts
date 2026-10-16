// modules/ai/services/draftContext.service.ts
// Loads the project background for the ticket-writing assistants, ONLY through
// the app's own access-checked services, so the AI never sees what the caller
// couldn't open themselves:
//   project description      ProjectService.getProject
//   related test case        TestCaseService.getTestCase
//   suite                    TestSuiteService.getTestSuite
//   similar bugs             TicketLinkService.findSimilar → BugService.getAccessible
//   similar feature requests TicketLinkService.findSimilar → FeatureRequestService.getAccessible
// Customer feedback tickets are never loaded: they can carry end users'
// personal details.
//
// Background is optional: if a suite or the similarity search can't be read,
// the draft goes ahead without it. The contribution check is not optional.
import { ProjectService } from "../../project/services/project.service";
import { TicketLinkService } from "../../ticketLink/services/ticketLink.service";
import type { SimilarTicket, SuiteContext, TestCaseContext } from "../domain/draftContext";
import type { Actor } from "../../../shared/types/actor";

const { AppError } = require("../../../shared/errors/AppError");
const { TestCaseService } = require("../../testCase/services/testCase.service");
const { BugService } = require("../../bug/services/bug.service");
const { FeatureRequestService } = require("../../featureRequest/services/featureRequest.service");

const MAX_SIMILAR = 3;

type Loaded = { title: string; description: string | null; status: string };

export class DraftContextService {
  static Instance = new DraftContextService();

  constructor(
    private readonly projects: ProjectService = ProjectService.Instance,
    private readonly testCases = TestCaseService.Instance,
    private readonly ticketLinks: Pick<TicketLinkService, "findSimilar"> = TicketLinkService.Instance,
    private readonly bugs = BugService.Instance,
    private readonly featureRequests = FeatureRequestService.Instance
  ) {}

  // The same gate as filing the ticket: a read-only viewer can read the
  // project's tickets but not raise one, so can't draft one either. Runs
  // before any AI call, so a refused draft costs nothing.
  async assertCanDraft(actor: Actor, projectId: string): Promise<{ description: string | null }> {
    const project = await this.projects.getProject(actor, projectId);
    await this.projects.assertCanContribute(actor, projectId);
    return { description: project?.description ?? null };
  }

  // A test case the user explicitly picked must be readable and in this project.
  async testCase(actor: Actor, testCaseId: string, projectId: string): Promise<{ testCase: TestCaseContext; suite: SuiteContext }> {
    const tc = await this.testCases.getTestCase(actor, testCaseId);
    const suite = await this.testCases.suiteService.getTestSuite(actor, tc.suiteId);
    if (suite.projectId !== projectId) {
      throw new AppError("Related test case does not belong to this project", 422);
    }
    return {
      testCase: {
        title: tc.title,
        description: tc.description ?? null,
        steps: tc.steps ?? [],
        expectedResult: tc.expectedResult ?? "",
      },
      suite: { name: suite.name, description: suite.description ?? null },
    };
  }

  // Background only: an unreadable suite is skipped, not an error.
  async suite(actor: Actor, suiteId: string, projectId: string): Promise<SuiteContext | null> {
    try {
      const s = await this.testCases.suiteService.getTestSuite(actor, suiteId);
      return s.projectId === projectId ? { name: s.name, description: s.description ?? null } : null;
    } catch {
      return null;
    }
  }

  async similarBugs(actor: Actor, p: { projectId: string; title: string; excludeId?: string }): Promise<SimilarTicket[]> {
    return this.similar(actor, p, "bug", (id) => this.bugs.getAccessible(actor, id));
  }

  async similarFeatureRequests(actor: Actor, p: { projectId: string; title: string; excludeId?: string }): Promise<SimilarTicket[]> {
    return this.similar(actor, p, "feature_request", (id) => this.featureRequests.getAccessible(actor, id));
  }

  // The same title search as the form's "has this been reported before?"
  // panel, kept to one ticket type and re-read with the usual access check.
  private async similar(
    actor: Actor,
    p: { projectId: string; title: string; excludeId?: string },
    type: "bug" | "feature_request",
    load: (id: string) => Promise<Loaded>
  ): Promise<SimilarTicket[]> {
    if (!p.title.trim()) return [];
    try {
      const matches = await this.ticketLinks.findSimilar(actor, {
        projectId: p.projectId,
        title: p.title,
        // When editing, the ticket itself would be its own best match.
        ...(p.excludeId ? { excludeType: type, excludeId: p.excludeId } : {}),
      });
      const ids = matches.filter((m) => m.type === type).slice(0, MAX_SIMILAR).map((m) => m.id);
      const loaded = await Promise.all(ids.map((id) => load(id).catch(() => null)));
      return loaded
        .filter((t): t is Loaded => t !== null)
        .map((t) => ({ title: t.title, description: t.description ?? null, status: t.status }));
    } catch (err) {
      console.warn(`[ai] similar ${type}s unavailable for a draft:`, err instanceof Error ? err.message : err);
      return [];
    }
  }
}
