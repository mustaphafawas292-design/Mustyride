const { verifyToken } = require('../utils/token');
const ApiError = require('../utils/ApiError');
const { User, Rider, Admin } = require('../models');

const MODEL_BY_ROLE = { customer: User, rider: Rider, admin: Admin };

/** Verifies the JWT and attaches req.actor + req.actorRole */
function protect(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        throw new ApiError(401, 'Not authenticated. Missing bearer token.');
      }
      const token = authHeader.split(' ')[1];
      const decoded = verifyToken(token); // { id, role }

      if (allowedRoles.length && !allowedRoles.includes(decoded.role)) {
        throw new ApiError(403, 'You are not allowed to perform this action.');
      }

      const Model = MODEL_BY_ROLE[decoded.role];
      const actor = await Model.findById(decoded.id);
      if (!actor) throw new ApiError(401, 'Account no longer exists.');
      if (actor.isSuspended || actor.status === 'suspended') {
        throw new ApiError(403, 'This account has been suspended.');
      }

      req.actor = actor;
      req.actorRole = decoded.role;
      next();
    } catch (err) {
      next(err.statusCode ? err : new ApiError(401, 'Invalid or expired token.'));
    }
  };
}

module.exports = { protect };
