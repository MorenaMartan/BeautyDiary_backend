import { models, nextId } from "../db.js";

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

export async function login(req, res) {
  const { username, password } = req.body;

  const employee = await models.Employee.findOne(usernameQuery(username)).lean();

  if (employee && matchesPassword(employee, password)) {
    return res.json({ user: publicUser(employee, "employee") });
  }

  const client = await models.Client.findOne(usernameQuery(username)).lean();

  if (client && matchesPassword(client, password)) {
    return res.json({ user: publicUser(client, "client") });
  }

  return res.status(401).json({ message: "Wrong username or password" });
}

export async function signup(req, res) {
  const name = req.body.name || "New";
  const username = req.body.username || name;
  const alreadyExists =
    (await models.Employee.exists(usernameQuery(username))) || (await models.Client.exists(usernameQuery(username)));

  if (alreadyExists) {
    return res.status(409).json({ message: "Username already exists" });
  }

  const client = await models.Client.create({
    id: await nextId(models.Client),
    name,
    surname: req.body.surname || "Client",
    username,
    password: req.body.password || name.toLowerCase(),
    email: req.body.email || "",
    mobile: req.body.mobile || "",
    birthday: req.body.birthday || "",
    diary: [{ date: "", text: "", expanded: false }],
  });

  res.status(201).json({ user: publicUser(client, "client") });
}

function matchesPassword(user, password) {
  return user.password === password || user.name?.toLowerCase() === password;
}

function usernameQuery(username = "") {
  return { username: new RegExp(`^${escapeRegex(username)}$`, "i") };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
