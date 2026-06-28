// modules/auth/controllers/auth.controller.js
// Thin coordinators. Read req.validated, call the service, return ApiResponse.
const { AuthService } = require("../services/auth.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toAuthResponse, toUserResponse } = require("../dto/auth.dto");

class AuthController {
  static async register(req, res, next) {
    try {
      const { user, tokens } = await AuthService.Instance.register(
        req.validated.body
      );
      res
        .status(201)
        .json(ApiResponse.created("Account created", toAuthResponse(user, tokens)));
    } catch (err) {
      next(err);
    }
  }

  static async verifyEmail(req, res, next) {
    try {
      const user = await AuthService.Instance.verifyEmail(req.validated.body);
      res.status(200).json(ApiResponse.ok("Email verified", toUserResponse(user)));
    } catch (err) {
      next(err);
    }
  }

  static async resendVerification(req, res, next) {
    try {
      await AuthService.Instance.resendVerification(req.validated.body);
      res
        .status(200)
        .json(ApiResponse.ok("If the account exists and is unverified, a code has been sent", null));
    } catch (err) {
      next(err);
    }
  }

  static async forgotPassword(req, res, next) {
    try {
      await AuthService.Instance.forgotPassword(req.validated.body);
      res
        .status(200)
        .json(ApiResponse.ok("If an account exists for that email, a reset code has been sent", null));
    } catch (err) {
      next(err);
    }
  }

  static async resetPassword(req, res, next) {
    try {
      await AuthService.Instance.resetPassword(req.validated.body);
      res.status(200).json(ApiResponse.ok("Password reset successful", null));
    } catch (err) {
      next(err);
    }
  }

  static async login(req, res, next) {
    try {
      const { user, tokens } = await AuthService.Instance.login(req.validated.body);
      res
        .status(200)
        .json(ApiResponse.ok("Login successful", toAuthResponse(user, tokens)));
    } catch (err) {
      next(err);
    }
  }

  static async refresh(req, res, next) {
    try {
      const { user, tokens } = await AuthService.Instance.refresh(
        req.validated.body
      );
      res
        .status(200)
        .json(ApiResponse.ok("Token refreshed", toAuthResponse(user, tokens)));
    } catch (err) {
      next(err);
    }
  }

  static async logout(req, res, next) {
    try {
      await AuthService.Instance.logout(req.validated.body);
      res.status(200).json(ApiResponse.ok("Logged out", null));
    } catch (err) {
      next(err);
    }
  }

  static async google(req, res, next) {
    try {
      const { user, tokens } = await AuthService.Instance.google(req.validated.body);
      res
        .status(200)
        .json(ApiResponse.ok("Login successful", toAuthResponse(user, tokens)));
    } catch (err) {
      next(err);
    }
  }

  static async me(req, res, next) {
    try {
      const user = await AuthService.Instance.authRepo.findUserById(req.user.id);
      if (!user) {
        return res.status(404).json(ApiResponse.error("User not found", 404));
      }
      res.status(200).json(ApiResponse.ok("Current user", toUserResponse(user)));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { AuthController };
