// shared/errors/AppError.js
// Domain error. Carries an HTTP status code and never leaks internal details.
class AppError extends Error {
  constructor(message, statusCode = 400, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
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
