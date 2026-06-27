export function requireAdmin(req, res, next) {
  const role = req.headers["x-user-role"] || req.body.requestedByRole;

  if (role !== "Admin") {
    return res.status(403).json({ message: "Only admin can do this action" });
  }

  next();
}
