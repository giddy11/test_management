// shared/errors/AppError.js
// Domain error. Carries an HTTP status code and never leaks internal details.
class AppError extends Error {
  // `data` is optional and null by default everywhere except call sites that
  // deliberately attach a recoverable payload (e.g. the existing record on a
  // 409 conflict) — see errorHandler.middleware.js, which forwards it as-is.
  constructor(message, statusCode = 400, errors = [], data = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.data = data;
    this.name = "AppError";
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message = "Bad request", errors = []) {
    return new AppError(message, 400, errors);
  }

  static unauthorised(message = "Unauthorised") {
    return new AppError(message, 401);
  }

  static forbidden(message = "Forbidden") {
    return new AppError(message, 403);
  }

  static notFound(message = "Not found") {
    return new AppError(message, 404);
  }

  static conflict(message = "Conflict") {
    return new AppError(message, 409);
  }
}

module.exports = { AppError };
