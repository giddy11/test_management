// modules/serviceDesk/domain/conversation.ts
// The rules of the conversation on a request, kept pure so they can be tested
// without a database: who may edit or delete a message, how a reply is threaded
// and what it inherits, who can be @mentioned, and what a message may carry.
//
//   edit     the author only. A moderator silently rewriting someone's words
//            isn't the same kind of override as removing them.
//   delete   the author, or someone who manages IT requests. The row stays as a
//            tombstone so replies keep their place.
//   reply    always threads under a root message: replying to a reply goes under
//            that reply's own root, so there is never a third level.
//   private  a reply to an IT-only note is itself IT-only: a public reply under
//            a note the requester can't see would point at nothing, and could
//            quote it.
//   mention  only people who can read the message. Yourself and strangers are
//            dropped quietly (the picker can't always know who is eligible).
import { z } from "zod";

export const MAX_MESSAGE_LENGTH = 5000;
export const MAX_MESSAGE_FILES = 5;
export const MAX_MENTIONS = 10;

export interface MentionRef {
  id: string;
  name: string;
}

export interface Mentionable {
  id: string;
  name: string;
  isAgent: boolean;
}

export interface MessageFacts {
  authorId: string | null;
  deletedAt: Date | string | null;
}

export function canEditMessage(m: MessageFacts, actorId: string): boolean {
  return !m.deletedAt && !!m.authorId && m.authorId === actorId;
}

export function canDeleteMessage(m: MessageFacts, actorId: string, isModerator: boolean): boolean {
  if (m.deletedAt) return false;
  return isModerator || (!!m.authorId && m.authorId === actorId);
}

export interface ParentFacts {
  id: string;
  requestId: string;
  parentId: string | null;
  isInternal: boolean;
  deletedAt: Date | string | null;
}

export type ReplyResolution =
  | { ok: true; parentId: string; internal: boolean }
  | { ok: false; reason: "not_found" | "deleted" };

// `wantsInternal` is what the author asked for. A reply to an IT-only note is
// forced to be IT-only.
export function resolveReply(
  parent: ParentFacts | null,
  requestId: string,
  wantsInternal: boolean
): ReplyResolution {
  if (!parent || parent.requestId !== requestId) return { ok: false, reason: "not_found" };
  if (parent.deletedAt) return { ok: false, reason: "deleted" };
  return { ok: true, parentId: parent.parentId ?? parent.id, internal: wantsInternal || parent.isInternal };
}

// Who may be @mentioned in a message: an IT-only note can only name IT.
export function mentionPool(people: Mentionable[], internal: boolean): Mentionable[] {
  return internal ? people.filter((p) => p.isAgent) : people;
}

// The requested ids that are in the pool, once each, never the author.
export function resolveMentions(
  requestedIds: readonly string[] | undefined,
  pool: readonly Mentionable[],
  authorId: string
): MentionRef[] {
  if (!requestedIds?.length) return [];
  const byId = new Map(pool.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: MentionRef[] = [];
  for (const id of requestedIds) {
    if (id === authorId || seen.has(id)) continue;
    seen.add(id);
    const p = byId.get(id);
    if (p) out.push({ id: p.id, name: p.name });
    if (out.length === MAX_MENTIONS) break;
  }
  return out;
}

// On an edit, only people not already mentioned are told.
export function newlyMentioned(before: readonly MentionRef[], after: readonly MentionRef[]): MentionRef[] {
  const had = new Set(before.map((m) => m.id));
  return after.filter((m) => !had.has(m.id));
}

// A message needs words or at least one file.
export function hasContent(body: string, fileCount: number): boolean {
  return body.trim().length > 0 || fileCount > 0;
}

// ── Request bodies ───────────────────────────────────────────────────────────
// A message may arrive as JSON or, when it carries files, as multipart form
// data — where every field is a string. These accept both.
const truthy = z.preprocess((v) => (typeof v === "string" ? v === "true" || v === "1" : v), z.boolean());
const idList = z.preprocess((v) => {
  if (v === undefined || v === null || v === "") return [];
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return v.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return v;
}, z.array(z.string().uuid()).max(MAX_MENTIONS * 2));
const optionalId = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().uuid().optional());

export const postMessageSchema = z.object({
  body: z.string().trim().max(MAX_MESSAGE_LENGTH).default(""),
  internal: truthy.default(false),
  parentId: optionalId,
  mentionIds: idList.default([]),
});
export type PostMessageBody = z.infer<typeof postMessageSchema>;

export const editMessageSchema = z.object({
  body: z.string().trim().min(1, "A message can't be empty").max(MAX_MESSAGE_LENGTH),
  mentionIds: idList.default([]),
});
export type EditMessageBody = z.infer<typeof editMessageSchema>;
