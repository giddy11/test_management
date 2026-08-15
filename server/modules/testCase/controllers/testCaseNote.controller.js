// modules/testCase/controllers/testCaseNote.controller.js
const { TestCaseNoteService } = require("../services/testCaseNote.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toNoteResponse, toRunNoteResponse } = require("../dto/testCaseNote.dto");

class TestCaseNoteController {
  static async list(req, res, next) {
    try {
      const items = await TestCaseNoteService.Instance.listNotes(
        req.user,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Notes fetched", items.map(toNoteResponse)));
    } catch (err) {
      next(err);
    }
  }

  static async listRunNotes(req, res, next) {
    try {
      const items = await TestCaseNoteService.Instance.listRunNotes(
        req.user,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Run notes fetched", items.map(toRunNoteResponse)));
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const note = await TestCaseNoteService.Instance.addNote(
        req.user,
        req.validated.params.id,
        req.validated.body.body
      );
      res.status(201).json(ApiResponse.created("Note added", toNoteResponse(note)));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      await TestCaseNoteService.Instance.deleteNote(
        req.user,
        req.validated.params.id,
        req.validated.params.noteId
      );
      res.status(200).json(ApiResponse.ok("Note deleted", null));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { TestCaseNoteController };
