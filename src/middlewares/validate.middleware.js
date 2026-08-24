const ApiError = require('../utils/apiError');

// Usage: validate(schema) where schema is a zod schema for { body, params, query }
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });
console.log(req.body,result.error);
    if (!result.success) {
      const details = result.error.flatten();
      console.log(details)
      return next(new ApiError(400, 'Validation failed', details));
    }

    next();
  };
}

module.exports = validate;
