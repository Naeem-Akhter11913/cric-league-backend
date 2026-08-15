const ApiError = require('../utils/apiError');

// Usage: authorize(['organizer', 'super_admin'])
function authorize(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Not authenticated'));
    }
    if (allowedRoles.length && !allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
    }
    next();
  };
}

module.exports = authorize;
