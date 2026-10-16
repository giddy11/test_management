// modules/ai/domain/bugReportDraft.ts
// The AI assistant on the bug form (feature: bug_report_draft). The tester
// describes the problem in their own words; the model organises it into the
// bug form's fields, says which parts are its own suggestion rather than what
// the tester said, and asks follow-up questions about what's missing. The
// tester answers, and the draft is refined — never invented.
//
// The reply only FILLS the form. The tester reviews every field and files the
// bug with the ordinary Report bug button.
import { z } from "zod";
import { fit, looseChoice, looseList, looseText } from "./lenient";
import { inert, joinSections, section } from "./prompt";
import {
  ANSWERS_RULE,
  answersSection,
  backgroundRules,
  currentFormSection,
  projectSection,
  similarSection,
  suiteSection,
  testCaseSection,
  UNTRUSTED_RULE,
  type DraftContext,
  type FollowUpAnswer,
} from "./draftContext";

// The bug form's own limits (modules/bug/validators/bug.schema).
const LIMITS = { title: 200, description: 3000, step: 500, steps: 30, behaviour: 2000, environment: 255 };
const MAX_QUESTIONS = 5;
const QUESTION_MAX = 200;
const NOTE_MAX = 300;

export const BUG_SEVERITIES = ["Trivial", "Minor", "Major", "Critical"] as const;
export const BUG_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;

// Form fields the model may mark as "my suggestion — please confirm".
export const BUG_DRAFT_FIELDS = [
  "title",
  "description",
  "stepsToReproduce",
  "expectedBehavior",
  "actualBehavior",
  "environment",
  "severity",
  "priority",
] as const;
export type BugDraftField = (typeof BUG_DRAFT_FIELDS)[number];

export const bugReportReplySchema = z.object({
  title: looseText.refine((s) => s.trim().length > 0, "the title was empty"),
  description: looseText.refine((s) => s.trim().length > 0, "the description was empty"),
  stepsToReproduce: looseList(looseText),
  expectedBehavior: looseText,
  actualBehavior: looseText,
  environment: looseText,
  // A wrong suggestion here is harmless (the tester sees and changes it), so
  // anything unrecognised just becomes "unknown".
  severity: looseChoice([...BUG_SEVERITIES, "unknown"] as const, "unknown"),
  priority: looseChoice([...BUG_PRIORITIES, "unknown"] as const, "unknown"),
  severityReason: looseText,
  evidenceSuggestion: looseText,
  followUpQuestions: looseList(looseText),
  needsConfirmation: looseList(looseText),
});
export type BugReportReply = z.infer<typeof bugReportReplySchema>;

const str = (description: string) => ({ type: "string", description });

export const bugReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "description",
    "stepsToReproduce",
    "expectedBehavior",
    "actualBehavior",
    "environment",
    "severity",
    "priority",
    "severityReason",
    "evidenceSuggestion",
    "followUpQuestions",
    "needsConfirmation",
  ],
  properties: {
    title: str("A short, specific summary of the problem, under 120 characters."),
    description: str(
      "A clear explanation of the problem in plain text (no Markdown; short \"- \" lists are fine), under about 200 words: what is wrong, where, and who it affects. Don't repeat the steps or expected/actual results here."
    ),
    stepsToReproduce: {
      type: "array",
      maxItems: LIMITS.steps,
      description:
        "The steps to reproduce, one action per item, ONLY as the user described them (reworded for clarity is fine). Empty list if the user gave no steps.",
      items: { type: "string" },
    },
    expectedBehavior: str("What should happen. Empty string if the user didn't say and it isn't obvious from what they wrote."),
    actualBehavior: str("What actually happened, as the user reported it. Empty string if they didn't say."),
    environment: str("Browser, device, OS, app version or environment, ONLY if the user mentioned them. Otherwise an empty string."),
    severity: {
      type: "string",
      enum: [...BUG_SEVERITIES, "unknown"],
      description: "Suggested impact: Critical (blocks core use, data loss or security), Major (a feature broken, no workaround), Minor (works with a workaround or cosmetic but noticeable), Trivial (cosmetic). \"unknown\" if you can't tell.",
    },
    priority: {
      type: "string",
      enum: [...BUG_PRIORITIES, "unknown"],
      description: "Suggested urgency. \"unknown\" if you can't tell.",
    },
    severityReason: str("One short sentence explaining the suggested severity and priority. Empty if both are unknown."),
    evidenceSuggestion: str(
      "What evidence would help most, e.g. \"A screenshot of the error and the browser console log\". Empty string if nothing in particular."
    ),
    followUpQuestions: {
      type: "array",
      maxItems: MAX_QUESTIONS,
      description:
        "Up to 5 short questions about information that is missing or unclear and that a developer would need. Empty list if the report is complete.",
      items: { type: "string" },
    },
    needsConfirmation: {
      type: "array",
      description:
        "The fields whose content is your suggestion or inference rather than something the user stated — the user must confirm them. Always include severity and priority if you suggested them.",
      items: { type: "string", enum: [...BUG_DRAFT_FIELDS] },
    },
  },
} as const;

export const BUG_REPORT_SYSTEM_PROMPT = `You help software testers turn a rough description of a bug into a clear, complete bug report in a test-management tool, so a developer can understand, reproduce and fix it without going back and forth.

The tester will review every field, edit it, and file the report under their own name. Write as they would, plainly, and never mention that it was written by AI.

Organise, don't invent. Use only what the tester told you (in <user_words>, <current_form> and <answers>) and what clearly follows from it. Never invent reproduction steps, error messages, test results, data values, URLs, versions, browsers, devices, frequencies or causes. Don't guess at the root cause at all. When something a developer would need is missing, leave that field empty (an empty string or empty list) and ask about it in "followUpQuestions" instead. An honest, incomplete report is far better than a complete-looking invented one.

Field by field:
- title: specific and short, naming what fails and where (for example "Bug report doesn't submit when a screenshot is attached").
- description: what's wrong, where in the product, and the impact on the user. Don't repeat the steps or the expected/actual results.
- stepsToReproduce: only the steps the tester described, one action each, in order.
- expectedBehavior / actualBehavior: only if the tester said or it's unmistakable from what they wrote. If you infer expected behaviour, list it in needsConfirmation.
- environment: only what the tester mentioned.
- severity and priority: a suggestion only, with severityReason. They will be checked against the project's own rules. Use "unknown" if you can't judge.
- evidenceSuggestion: the screenshot, video or log that would help most.
- followUpQuestions: up to 5 specific questions, most important first — for example whether an error message is shown, whether it happens every time, or whether it happens without a particular step. Don't ask about things already answered.
- needsConfirmation: every field whose content is your suggestion or inference rather than the tester's own statement.

If <current_form> has content, the tester has already written part of the report: keep its facts and intent, improve the wording without changing the meaning, and fill in the gaps.

${ANSWERS_RULE}

${backgroundRules("similar_bugs", "bug")}

${UNTRUSTED_RULE(["user_words", "current_form", "answers", "project", "suite", "test_case", "similar_bugs"])}`;

export interface BugReportInput extends DraftContext {
  roughDescription?: string | null;
  form: {
    title?: string | null;
    description?: string | null;
    stepsToReproduce?: string[];
    expectedBehavior?: string | null;
    actualBehavior?: string | null;
    environment?: string | null;
  };
  answers?: FollowUpAnswer[];
}

// What is NOT sent: the project's name, people's names or emails, comments,
// attachments and screenshots, ids and reference codes, the severity/priority
// already picked (so the suggestion is independent), and customer feedback.
export function buildBugReportPrompt(input: BugReportInput): string {
  const f = input.form;
  return joinSections(
    projectSection(input.projectDescription),
    suiteSection(input.suite),
    section("user_words", input.roughDescription?.trim() ? inert(input.roughDescription) : ""),
    currentFormSection([
      ["Title", f.title],
      ["Description", f.description],
      ["Steps to reproduce", f.stepsToReproduce],
      ["Expected behaviour", f.expectedBehavior],
      ["Actual behaviour", f.actualBehavior],
      ["Environment", f.environment],
    ]),
    answersSection(input.answers),
    testCaseSection(input.testCase, "The tester linked the bug to this test case:"),
    similarSection("similar_bugs", "bug", input.similar),
    section(
      "not_visible_to_you",
      "Screenshots and attachments, the people involved, comments, and the rest of the project's tickets are deliberately not shared with you."
    ),
    "Write the bug report."
  );
}

export interface BugReportDraft {
  title: string;
  description: string;
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  environment: string;
  severity: (typeof BUG_SEVERITIES)[number] | null;
  priority: (typeof BUG_PRIORITIES)[number] | null;
  severityReason: string;
  evidenceSuggestion: string;
  followUpQuestions: string[];
  needsConfirmation: BugDraftField[];
}

// The model's reply is a suggestion; the form's limits win.
export function finishBugReport(reply: BugReportReply): BugReportDraft {
  const severity = reply.severity === "unknown" ? null : reply.severity;
  const priority = reply.priority === "unknown" ? null : reply.priority;
  const needs = new Set(reply.needsConfirmation.filter((f): f is BugDraftField => (BUG_DRAFT_FIELDS as readonly string[]).includes(f)));
  // A suggested severity/priority is never the tester's statement.
  if (severity) needs.add("severity");
  if (priority) needs.add("priority");
  return {
    title: fit(reply.title, LIMITS.title),
    description: fit(reply.description, LIMITS.description),
    stepsToReproduce: reply.stepsToReproduce
      .map((s) => fit(s.replace(/^\s*\d+[.)]\s*/, ""), LIMITS.step))
      .filter(Boolean)
      .slice(0, LIMITS.steps),
    expectedBehavior: fit(reply.expectedBehavior, LIMITS.behaviour),
    actualBehavior: fit(reply.actualBehavior, LIMITS.behaviour),
    environment: fit(reply.environment, LIMITS.environment),
    severity,
    priority,
    severityReason: fit(reply.severityReason, NOTE_MAX),
    evidenceSuggestion: fit(reply.evidenceSuggestion, NOTE_MAX),
    followUpQuestions: reply.followUpQuestions.map((q) => fit(q, QUESTION_MAX)).filter(Boolean).slice(0, MAX_QUESTIONS),
    needsConfirmation: [...needs],
  };
}
