// shared/utils/tests/emailKinds.spec.ts
//
// Guards the two promises the email log rests on:
//  1. every email is sent through ONE wrapper (nothing else in the server talks
//     to a mail transport), and
//  2. every send names its kind, from the one typed list, so the log can say
//     what each email was.
// Source scans are blunt, but they fail the moment someone adds a builder and
// forgets its kind, or sends mail some other way.
import { EMAIL_KINDS } from "../mail/emailKinds";
import { EMAIL_PROVIDER_CODES } from "../mail/emailProviders";

const fs = require("fs");
const path = require("path");

const SERVER_ROOT = path.join(__dirname, "..", "..", "..");
const MAIL_FILES = ["mailer.js", "mail/support.mail.ts", "mail/ticket.mail.ts", "mail/serviceDesk.mail.ts"].map((f) =>
  path.join(__dirname, "..", f)
);
const read = (file: string): string => fs.readFileSync(file, "utf8");

// Every .js/.ts under the server's own source, minus dependencies and tests.
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "tests", "test", "scripts", "dist", "coverage"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (/\.(js|ts)$/.test(entry.name) && !/\.spec\./.test(entry.name)) found.push(full);
  }
  return found;
}

describe("email kinds", () => {
  const sendCalls = (src: string) => (src.match(/return (?:send|sendEmail)\(\{/g) ?? []).length;
  const kindTags = (src: string) => [...src.matchAll(/^\s+kind: "([a-z_]+)",$/gm)].map((m) => m[1]);

  it("tags every send call with a kind", () => {
    for (const file of MAIL_FILES) {
      const src = read(file);
      expect({ file: path.basename(file), tagged: kindTags(src).length }).toEqual({
        file: path.basename(file),
        tagged: sendCalls(src),
      });
    }
  });

  it("uses only kinds from the typed list", () => {
    const used = MAIL_FILES.flatMap((f) => kindTags(read(f)));
    expect(used.filter((k) => !(EMAIL_KINDS as readonly string[]).includes(k))).toEqual([]);
  });

  it("uses each kind exactly once — none orphaned, none shared by two builders", () => {
    const used = MAIL_FILES.flatMap((f) => kindTags(read(f)));
    expect([...used].sort()).toEqual([...EMAIL_KINDS].sort());
  });

  it("keeps every kind within the column width and in lowercase snake_case", () => {
    for (const kind of EMAIL_KINDS) {
      expect(kind.length).toBeLessThanOrEqual(40);
      expect(kind).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });
});

describe("the one send wrapper", () => {
  it("is the only code that talks to a mail transport", () => {
    const talksToTransport = sourceFiles(SERVER_ROOT)
      .filter((file) => /require\(["']nodemailer["']\)|from ["']nodemailer["']|\.sendMail\(|EMAIL_SCRIPT_URL|env\.email\.scriptUrl/.test(read(file)))
      .map((file) => path.relative(SERVER_ROOT, file).split(path.sep).join("/"))
      // env.js reads the settings; emailTransports.ts is the transport itself.
      .filter((file) => !["config/env.js", "shared/utils/mail/emailTransports.ts"].includes(file));

    expect(talksToTransport).toEqual([]);
  });

  it("is what mailer.js exports as send()", () => {
    jest.isolateModules(() => {
      jest.doMock("../../../modules/user/repositories/user.repository", () => ({ UserRepository: { Instance: {} } }));
      const { sendEmail } = require("../mail/emailSender");
      expect(require("../mailer").send).toBe(sendEmail);
    });
  });
});

describe("email providers", () => {
  it("are lowercase codes that fit the column", () => {
    for (const code of EMAIL_PROVIDER_CODES) {
      expect(code.length).toBeLessThanOrEqual(30);
      expect(code).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });

  it('never include "none", which the API reserves for "no provider"', () => {
    expect(EMAIL_PROVIDER_CODES as readonly string[]).not.toContain("none");
  });
});
