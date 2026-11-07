const { verifyToken, AdminAuthError } = require('../services/adminAuth');

function requireAdminAuth(jwtSecret) {
  return function (req, res, next) {
    try {
      const token = req.cookies && req.cookies.admin_token;
      req.admin = verifyToken(token, jwtSecret);
      next();
    } catch (err) {
      if (err instanceof AdminAuthError) {
        return res.status(401).json({ error: err.message });
      }
      throw err;
    }
  };
}

module.exports = { requireAdminAuth };
