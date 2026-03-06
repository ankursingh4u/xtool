/**
 * Simple session-based password protection for the dashboard.
 * Not meant for production multi-user auth — just keeps your tool private.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.redirect('/login');
}

module.exports = { requireAuth };
