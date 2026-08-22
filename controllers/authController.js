import { models, nextId } from "../db.js";
import bcrypt from "bcrypt";
import { createAccessToken, createRefreshToken, verifyRefreshToken } from "../middleware/auth.js";

function publicUser(user, type) {
  return {
    id: user.id,
    name: user.name,
    surname: user.surname,
    username: user.username,
    role: type === "client" ? "Client" : user.role,
    type,
  };
}

function loginResponse(user, type, res) {
  const publicUserData = publicUser(user, type);
  res.cookie("beautyDiaryRefresh", createRefreshToken(publicUserData), refreshCookieOptions());
  return { user: publicUserData, token: createAccessToken(publicUserData) };
}

export async function login(req, res) {
  const { username, password } = req.body;

  const employee = await models.Employee.findOne(usernameQuery(username)).lean();

  if (employee && (await matchesPassword(employee, password))) {
    await upgradeLegacyPassword(models.Employee, employee, password);
    return res.json(loginResponse(employee, "employee", res));
  }

  const client = await models.Client.findOne(usernameQuery(username)).lean();

  if (client && (await matchesPassword(client, password))) {
    await upgradeLegacyPassword(models.Client, client, password);
    return res.json(loginResponse(client, "client", res));
  }

  return res.status(401).json({ message: "Wrong username or password" });
}

export async function signup(req, res) {
  const body = req.body || {};
  if (typeof body.password !== "string" || body.password.trim().length < 8) {
    return res.status(400).json({ message: "Password must contain at least 8 characters" });
  }

  const name = body.name || "New";
  const username = body.username || name;
  const alreadyExists =
    (await models.Employee.exists(usernameQuery(username))) || (await models.Client.exists(usernameQuery(username)));

  if (alreadyExists) {
    return res.status(409).json({ message: "Username already exists" });
  }

  const client = await models.Client.create({
    id: await nextId(models.Client),
    name,
    surname: body.surname || "Client",
    username,
    password: await bcrypt.hash(body.password, 12),
    email: body.email || "",
    mobile: body.mobile || "",
    birthday: body.birthday || "",
    diary: [{ date: "", text: "", expanded: false }],
  });

  res.status(201).json(loginResponse(client, "client", res));
}

export async function refresh(req, res) {
  try {
    const tokenUser = verifyRefreshToken(req.cookies.beautyDiaryRefresh || "");
    const type = tokenUser.type === "client" ? "client" : "employee";
    const Model = type === "client" ? models.Client : models.Employee;
    const currentUser = await Model.findOne({ id: tokenUser.id }).lean();
    if (!currentUser) throw new Error("Account not found");

    const user = publicUser(currentUser, type);
    res.cookie("beautyDiaryRefresh", createRefreshToken(user), refreshCookieOptions());
    res.json({ token: createAccessToken(user) });
  } catch {
    res.status(401).json({ message: "Invalid or expired refresh token" });
  }
}

export function logout(req, res) {
  res.clearCookie("beautyDiaryRefresh", refreshCookieOptions());
  res.sendStatus(204);
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

async function matchesPassword(user, password) {
  if (!password || !user.password) return false;
  if (user.password.startsWith("$2")) return bcrypt.compare(password, user.password);
  return user.password === password || user.name?.toLowerCase() === password;
}

async function upgradeLegacyPassword(Model, user, password) {
  if (user.password.startsWith("$2")) return;
  await Model.updateOne({ id: user.id }, { password: await bcrypt.hash(password, 12) });
}

function usernameQuery(username = "") {
  return { username: new RegExp(`^${escapeRegex(username)}$`, "i") };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
