// modules/clientCompany/controllers/clientCompany.controller.ts
import { ClientCompanyService } from "../services/clientCompany.service";
import { toClientCompanyResponse, toSupporterResponse } from "../dto/clientCompany.dto";

const { ApiResponse } = require("../../../shared/response/apiResponse");

export class ClientCompanyController {
  // Self-service — an IT supporter's own company, for the support portal
  // (which can't use the admin-only GET / list).
  static async fetchMine(req: any, res: any, next: any) {
    try {
      const { company, supporterCount } = await ClientCompanyService.Instance.fetchMyCompany(req.user);
      res
        .status(200)
        .json(ApiResponse.ok("Your client company", toClientCompanyResponse(company, supporterCount)));
    } catch (err) {
      next(err);
    }
  }

  static async fetchAll(req: any, res: any, next: any) {
    try {
      const rows = await ClientCompanyService.Instance.fetchCompanies(
        req.user,
        req.validated.query.projectId
      );
      res.status(200).json(
        ApiResponse.ok(
          "Client companies fetched",
          rows.map(({ company, supporterCount }) =>
            toClientCompanyResponse(company, supporterCount)
          )
        )
      );
    } catch (err) {
      next(err);
    }
  }

  static async create(req: any, res: any, next: any) {
    try {
      const { projectId, ...data } = req.validated.body;
      const company = await ClientCompanyService.Instance.createCompany(
        req.user,
        projectId,
        data
      );
      res
        .status(201)
        .json(ApiResponse.created("Client company created", toClientCompanyResponse(company)));
    } catch (err) {
      next(err);
    }
  }

  static async update(req: any, res: any, next: any) {
    try {
      const company = await ClientCompanyService.Instance.updateCompany(
        req.user,
        req.validated.params.id,
        req.validated.body
      );
      res
        .status(200)
        .json(ApiResponse.ok("Client company updated", company && toClientCompanyResponse(company)));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req: any, res: any, next: any) {
    try {
      await ClientCompanyService.Instance.deleteCompany(req.user, req.validated.params.id);
      res.status(200).json(ApiResponse.ok("Client company deleted", null));
    } catch (err) {
      next(err);
    }
  }

  static async setLink(req: any, res: any, next: any) {
    try {
      const result = await ClientCompanyService.Instance.setFeedbackLink(
        req.user,
        req.validated.params.id,
        req.validated.body.enabled
      );
      res.status(200).json(ApiResponse.ok("Feedback link updated", result));
    } catch (err) {
      next(err);
    }
  }

  // ── Partner integration API (server-to-server, unauthenticated) ────────────
  static async integrationProvision(req: any, res: any, next: any) {
    try {
      const result = await ClientCompanyService.Instance.provisionCompany(req.validated.body);
      res.status(201).json(
        ApiResponse.created("Client company provisioned", {
          company: toClientCompanyResponse(result.company),
          supportLead: toSupporterResponse(result.supportLead),
        })
      );
    } catch (err) {
      next(err);
    }
  }

  static async listSupporters(req: any, res: any, next: any) {
    try {
      const users = await ClientCompanyService.Instance.listSupporters(
        req.user,
        req.validated.params.id
      );
      res
        .status(200)
        .json(ApiResponse.ok("Supporters fetched", users.map(toSupporterResponse)));
    } catch (err) {
      next(err);
    }
  }

  static async createSupporter(req: any, res: any, next: any) {
    try {
      const user = await ClientCompanyService.Instance.createSupporter(
        req.user,
        req.validated.params.id,
        req.validated.body
      );
      res
        .status(201)
        .json(ApiResponse.created("Supporter account created", toSupporterResponse(user)));
    } catch (err) {
      next(err);
    }
  }

  static async removeSupporter(req: any, res: any, next: any) {
    try {
      await ClientCompanyService.Instance.removeSupporter(
        req.user,
        req.validated.params.id,
        req.validated.params.userId
      );
      res.status(200).json(ApiResponse.ok("Supporter removed", null));
    } catch (err) {
      next(err);
    }
  }

  static async setSupporterLead(req: any, res: any, next: any) {
    try {
      const user = await ClientCompanyService.Instance.setSupporterLead(
        req.user,
        req.validated.params.id,
        req.validated.params.userId,
        req.validated.body.isSupportLead
      );
      res.status(200).json(ApiResponse.ok("Supporter updated", user && toSupporterResponse(user)));
    } catch (err) {
      next(err);
    }
  }

  // Admin-only — designating a company's primary lead is never self-service.
  static async setPrimarySupportLead(req: any, res: any, next: any) {
    try {
      const user = await ClientCompanyService.Instance.setPrimarySupportLead(
        req.user,
        req.validated.params.id,
        req.validated.params.userId,
        req.validated.body.isPrimary
      );
      res.status(200).json(ApiResponse.ok("Supporter updated", user && toSupporterResponse(user)));
    } catch (err) {
      next(err);
    }
  }
}
