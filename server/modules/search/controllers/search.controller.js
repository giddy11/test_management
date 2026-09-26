// modules/search/controllers/search.controller.js
const { SearchService } = require("../services/search.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toSearchResultResponse } = require("../dto/search.dto");

class SearchController {
  // GET /search?q=&limit= — the global search box. Deliberately not paginated:
  // it returns the top matches for what has been typed so far, and typing more
  // is how you narrow it.
  static async search(req, res, next) {
    try {
      const rows = await SearchService.Instance.search(req.user, req.validated.query);
      res
        .status(200)
        .json(ApiResponse.ok("Search results fetched", rows.map(toSearchResultResponse)));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { SearchController };
