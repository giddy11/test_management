// modules/subscription/controllers/subscription.controller.ts
import { SubscriptionService } from "../services/subscription.service";
import { PlanLimitsService } from "../services/planLimits.service";

const { ApiResponse } = require("../../../shared/response/apiResponse");

const S = () => SubscriptionService.Instance;

export class SubscriptionController {
  // The signed-in person's own organisation: which plan, what it unlocks, and
  // how much of each limit is used (so the app can say when it's full).
  static async mine(req: any, res: any, next: any) {
    try {
      const orgId: string | null = req.user.organizationId ?? null;
      const data = orgId
        ? { ...(await S().current(orgId)), usage: await PlanLimitsService.Instance.usage(orgId) }
        : null;
      res.status(200).json(ApiResponse.ok("Your plan", data));
    } catch (err) {
      next(err);
    }
  }

  static async catalog(req: any, res: any, next: any) {
    try {
      const data = { ...S().catalog(), entitlements: await S().entitlements() };
      res.status(200).json(ApiResponse.ok("Plans", data));
    } catch (err) {
      next(err);
    }
  }

  static async updateEntitlements(req: any, res: any, next: any) {
    try {
      const entitlements = await S().updateEntitlements(req.user, req.validated.body);
      res.status(200).json(ApiResponse.ok("Plan features saved", { ...S().catalog(), entitlements }));
    } catch (err) {
      next(err);
    }
  }

  static async organization(req: any, res: any, next: any) {
    try {
      const data = await S().detail(req.validated.params.organizationId);
      res.status(200).json(ApiResponse.ok("Organisation plan", data));
    } catch (err) {
      next(err);
    }
  }

  static async setPlan(req: any, res: any, next: any) {
    try {
      const data = await S().setPlan(req.user, req.validated.params.organizationId, req.validated.body);
      res.status(200).json(ApiResponse.ok("Plan updated", data));
    } catch (err) {
      next(err);
    }
  }

  static async recordPayment(req: any, res: any, next: any) {
    try {
      const data = await S().recordPayment(req.user, req.validated.params.organizationId, req.validated.body);
      res.status(201).json(ApiResponse.ok("Payment recorded", data));
    } catch (err) {
      next(err);
    }
  }
}
