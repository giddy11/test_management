// modules/emailLog/tests/emailLogRow.spec.ts
// The rules for turning "an email went out" into a log row: what is redacted,
// what is cut to fit its column, and what the row simply has no room for.
import { EMAIL_KINDS, SUBJECT_REDACTED_LABELS } from "../../../shared/utils/mail/emailKinds";
import { EMAIL_LOG_LIMITS, loggedSubject, toLogRow, truncate } from "../domain/emailLogRow";

const base = { to: "person@company.com", subject: "Hello", status: "sent" as const };

describe("toLogRow", () => {
  it("carries the provider, the fallback flag, the provider's message id and the note", () => {
    const row = toLogRow({
      ...base,
      kind: "bug_new",
      provider: "script_relay",
      fallback: true,
      providerMessageId: "relay-7",
      note: "gmail failed (x); sent through script_relay",
      organizationId: "org-1",
    });
    expect(row).toEqual({
      organizationId: "org-1",
      toEmail: "person@company.com",
      subject: "Hello",
      kind: "bug_new",
      status: "sent",
      provider: "script_relay",
      fallback: true,
      providerMessageId: "relay-7",
      note: "gmail failed (x); sent through script_relay",
    });
  });

  it("defaults the optional columns to null / false", () => {
    expect(toLogRow(base)).toEqual({
      organizationId: null,
      toEmail: "person@company.com",
      subject: "Hello",
      kind: null,
      status: "sent",
      provider: null,
      fallback: false,
      providerMessageId: null,
      note: null,
    });
  });

  it("turns an empty note or message id into null, not an empty string", () => {
    const row = toLogRow({ ...base, note: "", providerMessageId: "" });
    expect(row.note).toBeNull();
    expect(row.providerMessageId).toBeNull();
  });

  it("has no column that could hold a message body or an attachment", () => {
    const row = toLogRow({ ...base, html: "<p>secret</p>", text: "secret", attachments: [1] } as any);
    expect(Object.keys(row)).not.toEqual(expect.arrayContaining(["html", "text", "body", "attachments"]));
    expect(JSON.stringify(row)).not.toContain("secret");
  });

  it("cuts every value to its column width", () => {
    const long = "é".repeat(2000);
    const row = toLogRow({
      ...base,
      to: long,
      subject: long,
      kind: long,
      provider: long as any,
      providerMessageId: long,
      note: long,
    });
    expect(Array.from(row.toEmail).length).toBeLessThanOrEqual(EMAIL_LOG_LIMITS.toEmail);
    expect(Array.from(row.subject).length).toBeLessThanOrEqual(EMAIL_LOG_LIMITS.subject);
    expect(Array.from(row.kind!).length).toBeLessThanOrEqual(EMAIL_LOG_LIMITS.kind);
    expect(Array.from(row.provider!).length).toBeLessThanOrEqual(EMAIL_LOG_LIMITS.provider);
    expect(Array.from(row.providerMessageId!).length).toBeLessThanOrEqual(EMAIL_LOG_LIMITS.providerMessageId);
    expect(Array.from(row.note!).length).toBeLessThanOrEqual(EMAIL_LOG_LIMITS.note);
  });
});

describe("truncate", () => {
  it("leaves a value that fits alone", () => {
    expect(truncate("abc", 3)).toBe("abc");
  });

  it("ends a cut value with an ellipsis, within the limit", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
  });

  it("never splits an emoji in half", () => {
    const cut = truncate("😀".repeat(10), 5);
    expect(cut).toBe("😀😀😀😀…");
    expect(cut).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe("loggedSubject", () => {
  it.each(Object.entries(SUBJECT_REDACTED_LABELS))("replaces the subject of %s with a fixed label", (kind, label) => {
    expect(loggedSubject(kind, "Your code is 123456")).toBe(label);
  });

  it("keeps the real subject for every kind that carries no secret", () => {
    const open = EMAIL_KINDS.filter((k) => !(k in SUBJECT_REDACTED_LABELS));
    expect(open.length).toBeGreaterThan(20);
    for (const kind of open) expect(loggedSubject(kind, "Real subject")).toBe("Real subject");
  });

  it("keeps the subject when the kind is unknown or missing", () => {
    expect(loggedSubject("made_up", "Real subject")).toBe("Real subject");
    expect(loggedSubject(null, "Real subject")).toBe("Real subject");
  });

  it("redacts every kind whose message carries a sign-in secret", () => {
    expect(Object.keys(SUBJECT_REDACTED_LABELS).sort()).toEqual(
      ["password_reset", "supporter_invite", "ticket_lookup_code", "verification", "welcome"].sort()
    );
  });
});
