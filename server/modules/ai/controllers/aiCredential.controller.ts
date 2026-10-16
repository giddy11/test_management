// modules/ai/controllers/aiCredential.controller.ts
// One controller for both key scopes — the organisation's keys and the
// caller's own. The route decides the scope (see keyRoutes in ai.routes.ts).
import { AiCredentialService, type AiKeyScope } from "../services/aiCredential.service";

const { ApiResponse } = require("../../../shared/response/apiResponse");

type Handler = (req: any, res: any, next: any) => Promise<void>;

export function aiCredentialController(scope: AiKeyScope, service = AiCredentialService.Instance) {
  const handle =
    (fn: (req: any) => Promise<{ message: string; data?: unknown }>): Handler =>
    async (req, res, next) => {
      try {
        const { message, data } = await fn(req);
        res.status(200).json(ApiResponse.ok(message, data ?? null));
      } catch (err) {
        next(err);
      }
    };

  return {
    list: handle(async (req) => ({
      message: "AI keys",
      data: await service.list(req.user, scope),
    })),

    models: handle(async (req) => ({
      message: "Models",
      data: { models: await service.models(req.user, scope, req.validated.params.provider, req.validated.body) },
    })),

    save: handle(async (req) => ({
      message: "AI key saved",
      data: await service.save(req.user, scope, req.validated.params.provider, req.validated.body),
    })),

    activate: handle(async (req) => {
      await service.activate(req.user, scope, req.validated.params.provider);
      return { message: "AI key in use" };
    }),

    remove: handle(async (req) => {
      await service.remove(req.user, scope, req.validated.params.provider);
      return { message: "AI key removed" };
    }),

    setFeatureModel: handle(async (req) => {
      await service.setFeatureModel(req.user, scope, req.validated.params.feature, req.validated.body);
      return { message: "Model set for this feature" };
    }),

    clearFeatureModel: handle(async (req) => {
      await service.setFeatureModel(req.user, scope, req.validated.params.feature, null);
      return { message: "Feature uses the key in use" };
    }),
  };
}
