// scripts/fakeConnector.js — a stand-in fulfilment connector for testing IT
// requests' webhook automation locally (no Power Automate needed).
//
//   node scripts/fakeConnector.js
//
// Env:
//   PORT    default 4010   → connector URL http://localhost:4010/hook
//                            (http + localhost is allowed outside production)
//   SECRET  the signing secret shown when you created the connector; when set,
//           every request's X-TestMate-Signature is checked
//   MODE    succeed | fail | accept | error | slow   (default succeed)
//             succeed → 200 {"status":"succeeded"}         fulfilled at once
//             fail    → 200 {"status":"failed"}            flagged for review
//             accept  → 202, then calls the callbackUrl after DELAY ms
//             error   → 503                                 retried 1/5/15 min
//             slow    → never answers within 10 s           retried
//   DELAY   for accept: ms before calling back (default 5000)
//   RESULT  for accept: succeeded | failed (default succeeded)
//
// It prints every delivery so you can see exactly what a real connector gets.
const http = require("http");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 4010);
const SECRET = process.env.SECRET || "";
const MODE = process.env.MODE || "succeed";
const DELAY = Number(process.env.DELAY || 5000);
const RESULT = process.env.RESULT === "failed" ? "failed" : "succeeded";

function verify(req, raw) {
  if (!SECRET) return "not checked (set SECRET to check)";
  const ts = req.headers["x-testmate-timestamp"];
  const sig = String(req.headers["x-testmate-signature"] || "");
  const expected = `sha256=${crypto.createHmac("sha256", SECRET).update(`${ts}.${raw}`).digest("hex")}`;
  const ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  return ok ? "valid" : "INVALID";
}

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = (() => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })();
      const event = req.headers["x-testmate-event"];
      console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.url} event=${event} delivery=${req.headers["x-testmate-delivery"]}`);
      console.log(`  signature: ${verify(req, raw)}`);
      if (body?.request) console.log(`  request: ${body.request.reference} "${body.request.title}" — ${body.request.item}`, body.request.answers);

      if (event === "ping") return res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');

      switch (MODE) {
        case "fail":
          return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "failed", note: "Fake connector: no licences left" }));
        case "error":
          return res.writeHead(503).end("Fake connector: service unavailable");
        case "slow":
          return; // never answers
        case "accept":
          res.writeHead(202, { "Content-Type": "application/json" }).end('{"accepted":true}');
          setTimeout(async () => {
            try {
              const r = await fetch(body.callbackUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: RESULT, note: `Fake connector: done after ${DELAY} ms`, externalReference: `FAKE-${Date.now()}` }),
              });
              console.log(`  callback → ${r.status} ${await r.text()}`);
            } catch (e) {
              console.log(`  callback failed: ${e.message}`);
            }
          }, DELAY);
          return;
        default:
          return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "succeeded", note: "Fake connector: licence assigned" }));
      }
    });
  })
  .listen(PORT, () => console.log(`Fake connector on http://localhost:${PORT}/hook — MODE=${MODE}${SECRET ? ", checking signatures" : ""}`));
