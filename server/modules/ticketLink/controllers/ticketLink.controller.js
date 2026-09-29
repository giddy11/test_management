// modules/ticketLink/controllers/ticketLink.controller.js
const { TicketLinkService } = require("../services/ticketLink.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");

class TicketLinkController {
  // GET /ticket-links?type=&id= — the links on one ticket's page.
  static async fetchLinks(req, res, next) {
    try {
      const { type, id } = req.validated.query;
      const data = await TicketLinkService.Instance.getLinks(req.user, { type, id });
      res.status(200).json(ApiResponse.ok("Ticket links fetched", data));
    } catch (err) {
      next(err);
    }
  }

  // GET /ticket-links/summary — badge data for a page of a list.
  static async summary(req, res, next) {
    try {
      const data = await TicketLinkService.Instance.getSummary(req.user, req.validated.query);
      res.status(200).json(ApiResponse.ok("Ticket link summary fetched", data));
    } catch (err) {
      next(err);
    }
  }

  // GET /ticket-links/similar — has this been raised before?
  static async similar(req, res, next) {
    try {
      const data = await TicketLinkService.Instance.findSimilar(req.user, req.validated.query);
      res.status(200).json(ApiResponse.ok("Similar tickets fetched", data));
    } catch (err) {
      next(err);
    }
  }

  // GET /ticket-links/candidates — the link picker's search.
  static async candidates(req, res, next) {
    try {
      const data = await TicketLinkService.Instance.searchCandidates(req.user, req.validated.query);
      res.status(200).json(ApiResponse.ok("Tickets fetched", data));
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const data = await TicketLinkService.Instance.createLink(req.user, req.validated.body);
      res.status(201).json(ApiResponse.created("Tickets linked", data));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      await TicketLinkService.Instance.deleteLink(req.user, req.validated.params.id);
      res.status(200).json(ApiResponse.ok("Link removed", null));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { TicketLinkController };
