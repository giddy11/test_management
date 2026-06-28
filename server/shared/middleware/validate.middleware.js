// shared/middleware/validate.middleware.js
// Runs BEFORE the controller. If validation fails the controller is never called.
const { ApiResponse } = require("../response/apiResponse");

const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({
    body: req.body,
    query: req.query,
    params: req.params,
  });

  if (!result.success) {
    return res.status(422).json(
      ApiResponse.error(
        "Validation failed",
        422,
        result.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }))
      )
    );
  }

  req.validated = result.data;
  next();
};

module.exports = { validate };
