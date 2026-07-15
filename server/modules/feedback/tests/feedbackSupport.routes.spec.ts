// modules/feedback/tests/feedbackSupport.routes.spec.ts
// The support portal must be it_support-only, and the triage list must
// exclude it_support (internal roles only). authMiddleware/validate/controllers
// are stubbed so only the real authorise() middleware runs.

function tag(fn: any, name: string) {
  fn.__tag = name;
  return fn;
}

jest.mock("../../../shared/middleware/auth.middleware", () => ({
  authMiddleware: tag((req: any, res: any, next: any) => next(), "auth"),
}));
jest.mock("../../../shared/middleware/validate.middleware", () => ({
  validate: () => tag((req: any, res: any, next: any) => next(), "validate"),
}));
jest.mock("../controllers/feedbackSupport.controller", () => ({
  FeedbackSupportController: {
    fetchQueue: jest.fn((req: any, res: any) => res.status(200).json({})),
    updateStatus: jest.fn((req: any, res: any) => res.status(200).json({})),
    history: jest.fn((req: any, res: any) => res.status(200).json({})),
    resolve: jest.fn((req: any, res: any) => res.status(200).json({})),
    escalate: jest.fn((req: any, res: any) => res.status(200).json({})),
    notifySubmitter: jest.fn((req: any, res: any) => res.status(200).json({})),
  },
}));
jest.mock("../controllers/feedback.controller", () => ({
  FeedbackController: {
    fetchAll: jest.fn((req: any, res: any) => res.status(200).json({})),
    manage: jest.fn((req: any, res: any) => res.status(200).json({})),
    history: jest.fn((req: any, res: any) => res.status(200).json({})),
    remove: jest.fn((req: any, res: any) => res.status(200).json({})),
    setLink: jest.fn((req: any, res: any) => res.status(200).json({})),
  },
}));

const supportRouter = require("../routes/feedbackSupport.routes");
const feedbackRouter = require("../routes/feedback.routes");

function authoriseHandlerFor(router: any, path: string, method: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  const authoriseLayer = layer.route.stack.find((s: any) => !s.handle.__tag);
  if (!authoriseLayer) throw new Error(`No authorise() for ${method.toUpperCase()} ${path}`);
  return authoriseLayer.handle;
}

function invoke(handler: any, role?: string) {
  const req = { user: role ? { role } : undefined };
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const res = { status };
  const next = jest.fn();
  handler(req, res, next);
  return { next, status, json };
}

describe("feedbackSupport.routes — role wiring", () => {
  const routes: [string, string][] = [
    ["/", "get"],
    ["/:id", "patch"],
    ["/:id/history", "get"],
    ["/:id/resolve", "post"],
    ["/:id/escalate", "post"],
    ["/:id/notify-submitter", "post"],
  ];

  it("admits it_support on every portal route", () => {
    for (const [path, method] of routes) {
      const handler = authoriseHandlerFor(supportRouter, path, method);
      expect(invoke(handler, "it_support").next).toHaveBeenCalled();
    }
  });

  it("blocks every internal role from the portal", () => {
    for (const [path, method] of routes) {
      const handler = authoriseHandlerFor(supportRouter, path, method);
      for (const role of ["superadmin", "admin", "user"]) {
        expect(invoke(handler, role).next).not.toHaveBeenCalled();
      }
    }
  });
});

describe("feedback.routes — it_support locked out of triage", () => {
  const routes: [string, string][] = [
    ["/", "get"],
    ["/:id", "patch"],
    ["/:id/history", "get"],
    ["/:id", "delete"],
  ];

  it("blocks it_support and admits internal roles", () => {
    for (const [path, method] of routes) {
      const handler = authoriseHandlerFor(feedbackRouter, path, method);
      expect(invoke(handler, "it_support").next).not.toHaveBeenCalled();
      expect(invoke(handler, "user").next).toHaveBeenCalled();
      expect(invoke(handler, "admin").next).toHaveBeenCalled();
    }
  });
});
