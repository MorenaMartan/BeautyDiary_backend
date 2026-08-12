import jwt from "jsonwebtoken";

export function createAccessToken(user) {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");

  return jwt.sign(
    { id: user.id, role: user.role, type: user.type },
    process.env.JWT_SECRET,
    { expiresIn: "15m" },
  );
}

export function createRefreshToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, type: user.type },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!token) return res.status(401).json({ message: "Authentication is required" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired access token" });
  }
}
