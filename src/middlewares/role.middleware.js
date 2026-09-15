const allowRoles = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const userRole = Number(req.user.role);

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: "Akses ditolak",
        });
      }

      next();
    } catch (error) {
      console.error("ROLE MIDDLEWARE ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan pada server",
      });
    }
  };
};

module.exports = allowRoles;
