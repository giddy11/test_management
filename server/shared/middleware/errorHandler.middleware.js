// shared/middleware/errorHandler.middleware.js
const { AppError } = require("../errors/AppError");
const { ApiResponse } = require("../response/apiResponse");

// 404 fallthrough for unknown routes.
function notFoundHandler(req, res) {
  res
    .status(404)
    .json(ApiResponse.error(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

// Centralised error handler — last middleware in the chain.
// eslint-disable-next-line no-unused-vars
function globalErrorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res
      .status(err.statusCode)
      .json(ApiResponse.error(err.message, err.statusCode, err.errors));
  }

  // Multer file-size / upload errors surface a `code` — keep them as 4xx.
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json(ApiResponse.error("File too large", 413));
  }

  // Never expose internal error details to the client.
  console.error("[Unhandled Error]", err);
  res.status(500).json(ApiResponse.error("Internal server error", 500));
}

module.exports = { notFoundHandler, globalErrorHandler };
