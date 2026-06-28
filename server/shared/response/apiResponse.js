// shared/response/apiResponse.js
// Standard response envelope. Every response — success or error — uses this shape
// so web and mobile clients can apply a single parser.
class ApiResponse {
  constructor(success, message, statusCode, data = null, errors = [], meta) {
    this.success = success;
    this.message = message;
    this.statusCode = statusCode;
    this.data = data;
    this.errors = errors;
    if (meta) this.meta = meta;
  }

  static ok(message, data, meta) {
    return new ApiResponse(true, message, 200, data, [], meta);
  }

  static created(message, data) {
    return new ApiResponse(true, message, 201, data);
  }

  static error(message, code = 400, errors) {
    return new ApiResponse(false, message, code, null, errors ?? []);
  }
}

module.exports = { ApiResponse };
