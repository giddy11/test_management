// modules/reviewPrompt/services/reviewPrompt.service.ts
// Decides when a person is shown the reminder pop-up, and with what: what they
// reported that now awaits their review, and what is assigned to them that still
// needs work. Answering a review is not here: the status change belongs to
// BugService and FeatureRequestService (see their answerReview).
import { ReviewPromptRepository } from "../repositories/reviewPrompt.repository";

const { BugRepository } = require("../../bug/repositories/bug.repository");
const { FeatureRequestRepository } = require("../../featureRequest/repositories/featureRequest.repository");
const { ProjectService } = require("../../project/services/project.service");
const { ActivityService } = require("../../activity/services/activity.service");
const { AppError } = require("../../../shared/errors/AppError");
const { formatReferenceCode } = require("../../../shared/utils/referenceCode");
const { markDeactivated } = require("../../../shared/utils/deactivatedUser");

export const DEFAULT_SETTINGS = { enabled: true, intervalHours: 2 };

export interface ReviewSettingsView {
  enabled: boolean;
  intervalHours: number;
  updatedAt: string | null;
}

interface TicketRef {
  type: "bug" | "feature_request";
  id: string;
  projectId: string;
  projectName: string;
  referenceCode: string;
  title: string;
}

// Something this person reported, waiting for their verdict.
export interface ReviewItem extends TicketRef {
  assigneeName: string | null;
  readySince: Date | null;
}

// Something assigned to this person that still needs work.
export interface WorkItem extends TicketRef {
  status: string;
}

export interface Reminder {
  items: ReviewItem[];
  work: WorkItem[];
}

type Actor = { id: string; [key: string]: unknown };
type Found = { type: TicketRef["type"]; record: any };

const found = (bugs: any[], requests: any[]): Found[] => [
  ...bugs.map((record) => ({ record, type: "bug" as const })),
  ...requests.map((record) => ({ record, type: "feature_request" as const })),
];

function ticketRef({ type, record }: Found, projectName: string): TicketRef {
  return {
    type,
    id: record.id,
    projectId: record.projectId,
    projectName,
    referenceCode:
      type === "bug"
        ? formatReferenceCode("BF", record.bugNumber, record.createdAt)
        : formatReferenceCode("FR", record.requestNumber, record.createdAt),
    title: record.title,
  };
}

// The lead's explicit order first (a bug's fix order, a request's priority),
// then oldest.
function byWorkOrder(a: Found, b: Found): number {
  const order = ({ type, record }: Found) =>
    (type === "bug" ? record.fixOrder : record.priority) ?? Number.MAX_SAFE_INTEGER;
  return order(a) - order(b) || a.record.createdAt.getTime() - b.record.createdAt.getTime();
}

export class ReviewPromptService {
  static Instance = new ReviewPromptService();

  constructor(
    private readonly repo = ReviewPromptRepository.Instance,
    private readonly bugRepo = BugRepository.Instance,
    private readonly frRepo = FeatureRequestRepository.Instance,
    private readonly projectService = ProjectService.Instance
  ) {}

  async getSettings(): Promise<ReviewSettingsView> {
    const row = await this.repo.findSettings();
    if (!row) return { ...DEFAULT_SETTINGS, updatedAt: null };
    return {
      enabled: row.enabled,
      intervalHours: row.intervalHours,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateSettings(actor: Actor, data: { enabled: boolean; intervalHours: number }): Promise<ReviewSettingsView> {
    const row = await this.repo.saveSettings({ ...data, updatedBy: actor.id });
    ActivityService.Instance.log(actor, {
      action: "review_prompt.settings_updated",
      summary: data.enabled
        ? `Set the review reminder to every ${data.intervalHours} hours`
        : "Turned the review reminder off",
      entityType: "review_prompt_settings",
      entityId: null,
      metadata: data,
    });
    return {
      enabled: row.enabled,
      intervalHours: row.intervalHours,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  }

  // What the pop-up should show right now. Empty means show nothing: reminders
  // are off, it isn't time yet, or nothing is waiting. Returning anything starts
  // the interval, so an empty answer never uses up a turn.
  async claim(actor: Actor): Promise<Reminder> {
    const none = { items: [], work: [] };
    const { enabled, intervalHours } = await this.getSettings();
    if (!enabled) return none;
    if (await this.repo.promptedWithin(actor.id, intervalHours)) return none;
    const reminder = await this.waitingOn(actor);
    if (!reminder.items.length && !reminder.work.length) return none;
    if (!(await this.repo.claim(actor.id, intervalHours))) return none;
    return reminder;
  }

  private async waitingOn(actor: Actor): Promise<Reminder> {
    const [reportedBugs, reportedRequests, assignedBugs, assignedRequests] = await Promise.all([
      this.bugRepo.findAwaitingReview(actor.id),
      this.frRepo.findAwaitingReview(actor.id),
      this.bugRepo.findAssignedOpen(actor.id),
      this.frRepo.findAssignedOpen(actor.id),
    ]);
    const toReview = found(reportedBugs, reportedRequests);
    const toDo = found(assignedBugs, assignedRequests);
    const projects = await this.actionableProjects(
      actor,
      [...toReview, ...toDo].map(({ record }) => record.projectId)
    );
    const actionable = ({ record }: Found) => projects.has(record.projectId);
    const refOf = (f: Found) => ticketRef(f, projects.get(f.record.projectId)!.name);

    const items = toReview
      .filter(actionable)
      .map((f) => {
        const assignee = f.record.assignedTo;
        return {
          ...refOf(f),
          assigneeName: assignee
            ? markDeactivated([assignee.firstName, assignee.lastName].filter(Boolean).join(" "), assignee)
            : null,
          readySince: f.record.statusUpdatedAt ?? null,
        };
      })
      .sort((a, b) => (a.readySince?.getTime() ?? 0) - (b.readySince?.getTime() ?? 0));

    const work = toDo
      .filter(actionable)
      .sort(byWorkOrder)
      .map((f) => ({ ...refOf(f), status: f.record.status }));

    return { items, work };
  }

  // The given projects this person can still act in. Someone since removed from
  // one (or left read-only) couldn't do anything about its items.
  private async actionableProjects(actor: Actor, projectIds: string[]) {
    const projects = new Map<string, { name: string }>();
    for (const projectId of new Set(projectIds)) {
      try {
        const project = await this.projectService.getProject(actor, projectId);
        await this.projectService.assertCanContribute(actor, projectId);
        projects.set(projectId, project);
      } catch (err) {
        // A refusal means "not theirs to act on"; anything else is a real fault.
        if (!(err instanceof AppError)) throw err;
      }
    }
    return projects;
  }
}
