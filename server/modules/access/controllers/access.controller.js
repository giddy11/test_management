// modules/access/controllers/access.controller.js
const { AccessService } = require("../services/access.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const {
  toRoleResponse,
  toCatalogResponse,
} = require("../dto/access.dto");

class AccessController {
  static async catalog(req, res, next) {
    try {
      const data = await AccessService.Instance.fetchCatalog(req.user);
      res.status(200).json(ApiResponse.ok("Permissions fetched", toCatalogResponse(data)));
    } catch (err) {
      next(err);
    }
  }

  static async fetchRoles(req, res, next) {
    try {
      const roles = await AccessService.Instance.fetchRoles(req.user);
      res.status(200).json(ApiResponse.ok("Roles fetched", roles.map(toRoleResponse)));
    } catch (err) {
      next(err);
    }
  }

  static async fetchRole(req, res, next) {
    try {
      const role = await AccessService.Instance.getRole(req.user, req.validated.params.id);
      res.status(200).json(ApiResponse.ok("Role fetched", toRoleResponse(role)));
    } catch (err) {
      next(err);
    }
  }

  static async createRole(req, res, next) {
    try {
      const role = await AccessService.Instance.createRole(req.user, req.validated.body);
      res.status(201).json(ApiResponse.created("Role created", toRoleResponse(role)));
    } catch (err) {
      next(err);
    }
  }

  static async updateRole(req, res, next) {
    try {
      const role = await AccessService.Instance.updateRole(
        req.user,
        req.validated.params.id,
        req.validated.body
      );
      res.status(200).json(ApiResponse.ok("Role saved", toRoleResponse(role)));
    } catch (err) {
      next(err);
    }
  }

  static async deleteRole(req, res, next) {
    try {
      await AccessService.Instance.deleteRole(req.user, req.validated.params.id);
      res.status(200).json(ApiResponse.ok("Role deleted", null));
    } catch (err) {
      next(err);
    }
  }

  static async setUserRoles(req, res, next) {
    try {
      const roles = await AccessService.Instance.setUserRoles(
        req.user,
        req.validated.params.id,
        req.validated.body.roleIds
      );
      res.status(200).json(ApiResponse.ok("Roles updated", roles.map(toRoleResponse)));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { AccessController };
