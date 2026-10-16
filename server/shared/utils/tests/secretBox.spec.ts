// shared/utils/tests/secretBox.spec.ts
import { open, seal } from "../secretBox";

const SECRET = "a-test-secret-that-is-at-least-32-characters";
const CONTEXT = "org-1:user-1:anthropic";

describe("secretBox", () => {
  it("round-trips a secret", () => {
    const sealed = seal("sk-ant-1234567890", SECRET, CONTEXT);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("sk-ant");
    expect(open(sealed, SECRET, CONTEXT)).toBe("sk-ant-1234567890");
  });

  it("uses a fresh IV every time", () => {
    expect(seal("same", SECRET, CONTEXT)).not.toBe(seal("same", SECRET, CONTEXT));
  });

  it("returns null with the wrong secret", () => {
    const sealed = seal("key", SECRET, CONTEXT);
    expect(open(sealed, "another-secret-that-is-also-32-characters!", CONTEXT)).toBeNull();
  });

  it("returns null when the ciphertext is moved to another owner or provider", () => {
    const sealed = seal("key", SECRET, CONTEXT);
    expect(open(sealed, SECRET, "org-1:user-2:anthropic")).toBeNull();
    expect(open(sealed, SECRET, "org-1:user-1:openai")).toBeNull();
  });

  it("returns null when tampered with", () => {
    const [v, iv, tag, ct] = seal("key-value", SECRET, CONTEXT).split(".");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 0xff;
    expect(open([v, iv, tag, flipped.toString("base64url")].join("."), SECRET, CONTEXT)).toBeNull();
  });

  it("returns null for a malformed value instead of throwing", () => {
    expect(open("", SECRET, CONTEXT)).toBeNull();
    expect(open("v1.only.three", SECRET, CONTEXT)).toBeNull();
    expect(open("v2.a.b.c", SECRET, CONTEXT)).toBeNull();
    expect(open("v1.!!.!!.!!", SECRET, CONTEXT)).toBeNull();
  });
});
