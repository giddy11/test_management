// modules/ai/domain/featureRequestDraft.ts
// The AI assistant on the feature-request form (feature: feature_request_draft).
// The user describes the idea in their own words; the model shapes it into a
// clear, actionable request, asks clarifying questions where it's vague, and
// says which parts are its own suggestion rather than what the user said.
//
// A feature request has no separate fields for the structure, so the sections
// (problem statement, proposed solution, business justification, expected
// outcome, acceptance criteria) become headed plain-text sections inside the
// existing Description. A section the model inferred rather than read from the
// user is headed "(suggested — please confirm)", so the distinction survives
// into the saved request.
import { z } from "zod";
import { fit, looseList, looseText } from "./lenient";
import { inert, joinSections, section } from "./prompt";
import {
  ANSWERS_RULE,
  answersSection,
  backgroundRules,
  currentFormSection,
  projectSection,
  similarSection,
  suiteSection,
  UNTRUSTED_RULE,
  type DraftContext,
  type FollowUpAnswer,
} from "./draftContext";

// The feature-request form's own limits (modules/featureRequest/validators).
const LIMITS = { title: 200, description: 3000, category: 50 };
const MAX_QUESTIONS = 5;
const MAX_CRITERIA = 8;
const QUESTION_MAX = 200;
const NOTE_MAX = 300;
// Per-section budgets so the whole write-up fits the 3000-character description.
const SECTION_MAX = { problemStatement: 500, proposedSolution: 800, businessJustification: 400, expectedOutcome: 350, criterion: 160 };

export const FEATURE_REQUEST_SECTIONS = [
  "problemStatement",
  "proposedSolution",
  "businessJustification",
  "expectedOutcome",
  "acceptanceCriteria",
] as const;
export type FeatureRequestSection = (typeof FEATURE_REQUEST_SECTIONS)[number];

export const SECTION_HEADINGS: Record<FeatureRequestSection, string> = {
  problemStatement: "Problem statement",
  proposedSolution: "Proposed solution",
  businessJustification: "Business justification",
  expectedOutcome: "Expected outcome",
  acceptanceCriteria: "Acceptance criteria",
};

// Descriptions are shown exactly as typed (no Markdown), so the markers are plain text.
export const TO_CONFIRM = "(suggested — please confirm)";

// Fields the model may mark as its own suggestion.
export const FEATURE_DRAFT_FIELDS = ["title", "category", ...FEATURE_REQUEST_SECTIONS] as const;
export type FeatureDraftField = (typeof FEATURE_DRAFT_FIELDS)[number];

export const featureRequestReplySchema = z.object({
  title: looseText.refine((s) => s.trim().length > 0, "the title was empty"),
  problemStatement: looseText,
  proposedSolution: looseText.refine((s) => s.trim().length > 0, "the proposed solution was empty"),
  businessJustification: looseText,
  expectedOutcome: looseText,
  acceptanceCriteria: looseList(looseText),
  category: looseText,
  evidenceSuggestion: looseText,
  followUpQuestions: looseList(looseText),
  needsConfirmation: looseList(looseText),
});
export type FeatureRequestReply = z.infer<typeof featureRequestReplySchema>;

const str = (description: string) => ({ type: "string", description });

export const featureRequestJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "problemStatement",
    "proposedSolution",
    "businessJustification",
    "expectedOutcome",
    "acceptanceCriteria",
    "category",
    "evidenceSuggestion",
    "followUpQuestions",
    "needsConfirmation",
  ],
  properties: {
    title: str("A concise name for the feature, under 100 characters."),
    problemStatement: str("The problem or limitation this addresses, from the user's point of view. Empty string if the user gave no hint of it."),
    proposedSolution: str("What the feature would do, in plain language, as the user described it. Plain text: short \"- \" lists are fine, no Markdown."),
    businessJustification: str("Why it's worth doing and the value to users or the business. Empty string unless the user said or it clearly follows."),
    expectedOutcome: str("The improvement expected once it exists. Empty string if not clear."),
    acceptanceCriteria: {
      type: "array",
      maxItems: MAX_CRITERIA,
      description: "Up to 8 checkable conditions for the feature to count as done, each one sentence, derived from what the user asked for.",
      items: { type: "string" },
    },
    category: str("A one- or two-word category such as \"Reporting\", \"UI/UX\" or \"Integration\". Empty string if unsure."),
    evidenceSuggestion: str("What supporting evidence would help (a mock-up, an example, a document). Empty string if nothing in particular."),
    followUpQuestions: {
      type: "array",
      maxItems: MAX_QUESTIONS,
      description: "Up to 5 clarifying questions where the request is too vague to act on. Empty list if it's clear.",
      items: { type: "string" },
    },
    needsConfirmation: {
      type: "array",
      description: "The fields whose content is your suggestion or inference rather than something the user said. The user must confirm them.",
      items: { type: "string", enum: [...FEATURE_DRAFT_FIELDS] },
    },
  },
} as const;

export const FEATURE_REQUEST_SYSTEM_PROMPT = `You help people turn a rough idea into a clear, actionable feature request in a test-management tool, so the product team can understand and evaluate it.

The user will review and edit everything and submit the request under their own name. Write as they would, plainly, and never mention that it was written by AI.

Refine, don't invent. Use only what the user told you (in <user_words>, <current_form> and <answers>) and what clearly follows from it. Don't invent requirements, numbers, deadlines, user groups, business value or technical constraints. Where a section can't be written honestly from what you were told, leave it empty and ask a question in "followUpQuestions" instead. When you do write something that is your own reasonable inference rather than what the user said — a likely benefit, an acceptance criterion they didn't state — include it, and list that field in "needsConfirmation" so it's shown as a suggestion to confirm.

Sections:
- title: concise, naming the capability.
- problemStatement: the problem or limitation, from the user's point of view.
- proposedSolution: what the feature does. Describe behaviour, not implementation.
- businessJustification: why it matters, only from what the user said or what plainly follows.
- expectedOutcome: what gets better once it exists.
- acceptanceCriteria: specific, checkable statements of done.
- category: a short category, or empty.
- evidenceSuggestion: what would help the team evaluate it (a mock-up, an example).
- followUpQuestions: up to 5 questions, most important first, where the request is too vague to act on. Don't ask about things already answered.

Keep the whole write-up compact: together the sections must fit in about 2,500 characters. Write plain text — it is shown exactly as typed, so use no Markdown (no #, ** or links); short "- " lists are fine.

If <current_form> has content, the user has already written part of the request: keep its facts and intent, improve the wording without changing the meaning, and organise it into the sections.

${ANSWERS_RULE}

${backgroundRules("similar_requests", "feature request")}

${UNTRUSTED_RULE(["user_words", "current_form", "answers", "project", "suite", "similar_requests"])}`;

export interface FeatureRequestInput extends DraftContext {
  roughDescription?: string | null;
  form: { title?: string | null; description?: string | null; category?: string | null };
  answers?: FollowUpAnswer[];
}

// What is NOT sent: the project's name, people's names or emails, comments,
// votes, attachments, reference links, ids, and customer feedback tickets.
export function buildFeatureRequestPrompt(input: FeatureRequestInput): string {
  const f = input.form;
  return joinSections(
    projectSection(input.projectDescription),
    suiteSection(input.suite),
    section("user_words", input.roughDescription?.trim() ? inert(input.roughDescription) : ""),
    currentFormSection([
      ["Title", f.title],
      ["Description", f.description],
      ["Category", f.category],
    ]),
    answersSection(input.answers),
    similarSection("similar_requests", "feature request", input.similar),
    section(
      "not_visible_to_you",
      "Attachments, reference links, votes, comments, the people involved, and the rest of the project's tickets are deliberately not shared with you."
    ),
    "Write the feature request."
  );
}

export interface FeatureRequestDraft {
  title: string;
  category: string;
  sections: {
    problemStatement: string;
    proposedSolution: string;
    businessJustification: string;
    expectedOutcome: string;
    acceptanceCriteria: string[];
  };
  // The sections as headed plain text, ready for the Description box.
  description: string;
  evidenceSuggestion: string;
  followUpQuestions: string[];
  needsConfirmation: FeatureDraftField[];
}

// Builds the Description from the sections, leaving out empty ones and marking
// the ones to confirm. If it's still over the limit, acceptance criteria are
// dropped from the end, then the whole thing is cut at a word boundary.
export function composeFeatureRequestDescription(
  sections: FeatureRequestDraft["sections"],
  toConfirm: ReadonlySet<string>,
  max = LIMITS.description
): string {
  const heading = (key: FeatureRequestSection) => `${SECTION_HEADINGS[key]}${toConfirm.has(key) ? ` ${TO_CONFIRM}` : ""}`;
  const build = (criteria: string[]) =>
    FEATURE_REQUEST_SECTIONS.map((key) => {
      if (key === "acceptanceCriteria") {
        return criteria.length ? `${heading(key)}\n${criteria.map((c) => `- ${c}`).join("\n")}` : "";
      }
      const text = sections[key].trim();
      return text ? `${heading(key)}\n${text}` : "";
    })
      .filter(Boolean)
      .join("\n\n");

  let criteria = [...sections.acceptanceCriteria];
  let text = build(criteria);
  while (text.length > max && criteria.length > 1) {
    criteria = criteria.slice(0, -1);
    text = build(criteria);
  }
  return fit(text, max);
}

export function finishFeatureRequest(reply: FeatureRequestReply): FeatureRequestDraft {
  const needs = new Set(
    reply.needsConfirmation.filter((f): f is FeatureDraftField => (FEATURE_DRAFT_FIELDS as readonly string[]).includes(f))
  );
  const sections = {
    problemStatement: fit(reply.problemStatement, SECTION_MAX.problemStatement),
    proposedSolution: fit(reply.proposedSolution, SECTION_MAX.proposedSolution),
    businessJustification: fit(reply.businessJustification, SECTION_MAX.businessJustification),
    expectedOutcome: fit(reply.expectedOutcome, SECTION_MAX.expectedOutcome),
    acceptanceCriteria: reply.acceptanceCriteria
      .map((c) => fit(c.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ""), SECTION_MAX.criterion))
      .filter(Boolean)
      .slice(0, MAX_CRITERIA),
  };
  return {
    title: fit(reply.title, LIMITS.title),
    category: fit(reply.category, LIMITS.category),
    sections,
    description: composeFeatureRequestDescription(sections, needs),
    evidenceSuggestion: fit(reply.evidenceSuggestion, NOTE_MAX),
    followUpQuestions: reply.followUpQuestions.map((q) => fit(q, QUESTION_MAX)).filter(Boolean).slice(0, MAX_QUESTIONS),
    needsConfirmation: [...needs],
  };
}
