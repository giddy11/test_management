// modules/serviceDesk/tests/serviceDeskConversation.spec.ts
// The conversation on an IT request: who may edit and delete, how a reply is
// threaded and what it inherits, who can be @mentioned, and the request bodies
// that arrive as JSON or as multipart form data.
import {
  MAX_MENTIONS,
  canDeleteMessage,
  canEditMessage,
  editMessageSchema,
  hasContent,
  mentionPool,
  newlyMentioned,
  postMessageSchema,
  resolveMentions,
  resolveReply,
  type Mentionable,
} from "../domain/conversation";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

const people: Mentionable[] = [
  { id: "emma", name: "Emma Stone", isAgent: false },
  { id: "agent", name: "IT Service Agent", isAgent: true },
  { id: "mary", name: "Mary Approver", isAgent: false },
];

describe("editing and deleting", () => {
  const mine = { authorId: "me", deletedAt: null };

  it("only the author edits", () => {
    expect(canEditMessage(mine, "me")).toBe(true);
    expect(canEditMessage(mine, "someone")).toBe(false);
  });

  it("nobody edits a deleted message, or one with no author", () => {
    expect(canEditMessage({ authorId: "me", deletedAt: new Date() }, "me")).toBe(false);
    expect(canEditMessage({ authorId: null, deletedAt: null }, "me")).toBe(false);
  });

  it("the author deletes their own message", () => {
    expect(canDeleteMessage(mine, "me", false)).toBe(true);
  });

  it("a moderator deletes anyone's, but an ordinary person can't delete another's", () => {
    expect(canDeleteMessage(mine, "mod", true)).toBe(true);
    expect(canDeleteMessage(mine, "someone", false)).toBe(false);
  });

  it("a deleted message can't be deleted again, even by a moderator", () => {
    expect(canDeleteMessage({ authorId: "me", deletedAt: new Date() }, "mod", true)).toBe(false);
  });
});

describe("replies", () => {
  const root = { id: "root", requestId: "r1", parentId: null, isInternal: false, deletedAt: null };
  const reply = { id: "reply", requestId: "r1", parentId: "root", isInternal: false, deletedAt: null };

  it("replying to a root threads under it", () => {
    expect(resolveReply(root, "r1", false)).toEqual({ ok: true, parentId: "root", internal: false });
  });

  it("replying to a reply threads under that reply's root, never a third level", () => {
    expect(resolveReply(reply, "r1", false)).toEqual({ ok: true, parentId: "root", internal: false });
  });

  it("a reply to an IT-only note is IT-only, whatever was asked for", () => {
    const note = { ...root, isInternal: true };
    expect(resolveReply(note, "r1", false)).toEqual({ ok: true, parentId: "root", internal: true });
  });

  it("IT can reply privately to a public message", () => {
    expect(resolveReply(root, "r1", true)).toEqual({ ok: true, parentId: "root", internal: true });
  });

  it("refuses a missing message, one on another request, and a deleted one", () => {
    expect(resolveReply(null, "r1", false)).toEqual({ ok: false, reason: "not_found" });
    expect(resolveReply(root, "other", false)).toEqual({ ok: false, reason: "not_found" });
    expect(resolveReply({ ...root, deletedAt: new Date() }, "r1", false)).toEqual({ ok: false, reason: "deleted" });
  });
});

describe("mentions", () => {
  it("an IT-only note can only name IT", () => {
    expect(mentionPool(people, true).map((p) => p.id)).toEqual(["agent"]);
    expect(mentionPool(people, false)).toHaveLength(3);
  });

  it("keeps eligible people once each, in the order given", () => {
    expect(resolveMentions(["mary", "emma", "mary"], people, "agent")).toEqual([
      { id: "mary", name: "Mary Approver" },
      { id: "emma", name: "Emma Stone" },
    ]);
  });

  it("drops the author and strangers quietly", () => {
    expect(resolveMentions(["agent", "ghost", "emma"], people, "agent")).toEqual([{ id: "emma", name: "Emma Stone" }]);
  });

  it("nothing requested, nothing mentioned", () => {
    expect(resolveMentions(undefined, people, "agent")).toEqual([]);
    expect(resolveMentions([], people, "agent")).toEqual([]);
  });

  it(`never names more than ${MAX_MENTIONS} people`, () => {
    const crowd: Mentionable[] = Array.from({ length: 30 }, (_, i) => ({ id: `u${i}`, name: `User ${i}`, isAgent: true }));
    expect(resolveMentions(crowd.map((p) => p.id), crowd, "nobody")).toHaveLength(MAX_MENTIONS);
  });

  it("an edit only tells the people it newly mentions", () => {
    const before = [{ id: "emma", name: "Emma Stone" }];
    const after = [
      { id: "emma", name: "Emma Stone" },
      { id: "mary", name: "Mary Approver" },
    ];
    expect(newlyMentioned(before, after)).toEqual([{ id: "mary", name: "Mary Approver" }]);
    expect(newlyMentioned(after, before)).toEqual([]);
  });
});

describe("what a message needs", () => {
  it("words or a file", () => {
    expect(hasContent("hello", 0)).toBe(true);
    expect(hasContent("   ", 1)).toBe(true);
    expect(hasContent("   ", 0)).toBe(false);
    expect(hasContent("", 0)).toBe(false);
  });
});

describe("posting a message", () => {
  it("accepts JSON", () => {
    const parsed = postMessageSchema.parse({ body: "  hi  ", internal: true, parentId: UUID_A, mentionIds: [UUID_B] });
    expect(parsed).toEqual({ body: "hi", internal: true, parentId: UUID_A, mentionIds: [UUID_B] });
  });

  it("accepts multipart form data, where every field is a string", () => {
    const parsed = postMessageSchema.parse({
      body: "with files",
      internal: "true",
      parentId: UUID_A,
      mentionIds: JSON.stringify([UUID_B]),
    });
    expect(parsed).toEqual({ body: "with files", internal: true, parentId: UUID_A, mentionIds: [UUID_B] });
  });

  it("defaults: public, no parent, no mentions, empty text (files may carry it)", () => {
    expect(postMessageSchema.parse({})).toEqual({ body: "", internal: false, parentId: undefined, mentionIds: [] });
  });

  it("treats a blank parent id from a form as no parent", () => {
    expect(postMessageSchema.parse({ body: "x", parentId: "" }).parentId).toBeUndefined();
  });

  it('reads "false" as false, not as a truthy string', () => {
    expect(postMessageSchema.parse({ body: "x", internal: "false" }).internal).toBe(false);
  });

  it("rejects a malformed id and an over-long message", () => {
    expect(postMessageSchema.safeParse({ body: "x", parentId: "nope" }).success).toBe(false);
    expect(postMessageSchema.safeParse({ body: "x", mentionIds: ["nope"] }).success).toBe(false);
    expect(postMessageSchema.safeParse({ body: "x".repeat(5001) }).success).toBe(false);
  });
});

describe("editing a message", () => {
  it("needs text and takes mentions", () => {
    expect(editMessageSchema.parse({ body: " fixed ", mentionIds: [UUID_A] })).toEqual({ body: "fixed", mentionIds: [UUID_A] });
    expect(editMessageSchema.safeParse({ body: "   " }).success).toBe(false);
  });
});
