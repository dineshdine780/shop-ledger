const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    // Authentication middleware must run first.
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Please log in to access this resource",
      });
    }

    // Check the role loaded from the database.
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource",
      });
    }

    next();
  };
};

module.exports = { authorizeRoles };