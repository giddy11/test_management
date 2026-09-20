// modules/user/controllers/user.controller.js
const { UserService } = require("../services/user.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toUserResponse } = require("../../auth/dto/auth.dto");
const { toRoleResponse } = require("../../access/dto/access.dto");

class UserController {
  static async fetchAll(req, res, next) {
    try {
      const result = await UserService.Instance.fetchUsers(req.user, req.validated.query);
      res
        .status(200)
        .json(ApiResponse.ok("Users fetched", result.data.map(toUserResponse), result.meta));
    } catch (err) {
      next(err);
    }
  }

  static async fetchById(req, res, next) {
    try {
      const user = await UserService.Instance.getUser(req.user, req.validated.params.id);
      res.status(200).json(ApiResponse.ok("User fetched", toUserResponse(user)));
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const user = await UserService.Instance.createUser(req.user, req.validated.body);
      res.status(201).json(ApiResponse.created("User created", toUserResponse(user)));
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const user = await UserService.Instance.updateUser(
        req.user,
        req.validated.params.id,
        req.validated.body
      );
      res.status(200).json(ApiResponse.ok("User updated", toUserResponse(user)));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      await UserService.Instance.deactivateUser(req.user, req.validated.params.id);
      res.status(200).json(ApiResponse.ok("User deactivated", null));
    } catch (err) {
      next(err);
    }
  }

  static async setRoles(req, res, next) {
    try {
      const roles = await UserService.Instance.setRoles(
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

module.exports = { UserController };
