// modules/project/controllers/project.controller.js
const { ProjectService } = require("../services/project.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toProjectResponse } = require("../dto/project.dto");

class ProjectController {
  static async fetchAll(req, res, next) {
    try {
      const result = await ProjectService.Instance.fetchProjects({
        ownerId: req.user.id,
        ...req.validated.query,
      });
      res
        .status(200)
        .json(
          ApiResponse.ok(
            "Projects fetched",
            result.data.map(toProjectResponse),
            result.meta
          )
        );
    } catch (err) {
      next(err);
    }
  }

  static async fetchById(req, res, next) {
    try {
      const project = await ProjectService.Instance.getProject(
        req.user.id,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Project fetched", toProjectResponse(project)));
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const project = await ProjectService.Instance.createProject(
        req.user.id,
        req.validated.body
      );
      res
        .status(201)
        .json(ApiResponse.created("Project created", toProjectResponse(project)));
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const project = await ProjectService.Instance.updateProject(
        req.user.id,
        req.validated.params.id,
        req.validated.body
      );
      res.status(200).json(ApiResponse.ok("Project updated", toProjectResponse(project)));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      await ProjectService.Instance.deleteProject(
        req.user.id,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Project deleted", null));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { ProjectController };
