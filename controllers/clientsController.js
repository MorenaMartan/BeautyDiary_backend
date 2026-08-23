import { models, nextId, syncUsersCollection } from "../db.js";
import bcrypt from "bcrypt";

export async function getClients(req, res) {
  const query = req.user.role === "Client" ? { id: req.user.id } : {};
  const clients = await models.Client.find(query).sort({ id: 1 }).lean();
  res.json(clients.map(toPublicClient));
}

export async function getClientStats(req, res) {
  const now = new Date();
  const daysAgo = (days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const appointmentDate = (appointment) => new Date(appointment.dayandhour.split(" ")[0]);
  const clients = await models.Client.find().lean();
  const appointments = await models.Appointment.find().lean();

  const recentAppointments = appointments.filter((appointment) =>
    appointment.status === "completed" &&
    appointmentDate(appointment) >= daysAgo(30) &&
    appointmentDate(appointment) <= now,
  );
  const recentCancelled = appointments.filter(
    (appointment) => appointment.status === "cancelled" && appointmentDate(appointment) >= daysAgo(90),
  );

  const topSpenders = clients
    .map((client) => ({
      ...client,
      spentLast30Days: recentAppointments
        .filter((appointment) => appointmentBelongsToClient(appointment, client))
        .reduce((sum, appointment) => sum + Number(appointment.price || 0), 0),
    }))
    .sort((a, b) => b.spentLast30Days - a.spentLast30Days)
    .slice(0, 5);

  const mostCancelled = clients
    .map((client) => ({
      ...client,
      cancelledLast90Days: recentCancelled.filter(
        (appointment) => appointmentBelongsToClient(appointment, client),
      ).length,
    }))
    .sort((a, b) => b.cancelledLast90Days - a.cancelledLast90Days)
    .slice(0, 5);

  const newClients = clients.filter((client) => client.createdAt && new Date(client.createdAt) >= daysAgo(30));

  const inactiveClients = clients.filter((client) => {
    const clientAppointments = appointments.filter(
      (appointment) => appointmentBelongsToClient(appointment, client),
    );

    if (!clientAppointments.length) return true;
    return Math.max(...clientAppointments.map((appointment) => appointmentDate(appointment).getTime())) < daysAgo(60).getTime();
  });

  res.json({
    topSpenders: topSpenders.map(toPublicClient),
    mostCancelled: mostCancelled.map(toPublicClient),
    newClients: newClients.map(toPublicClient),
    inactiveClients: inactiveClients.map(toPublicClient),
  });
}

export async function getClient(req, res) {
  if (req.user.role === "Client" && Number(req.params.id) !== req.user.id) {
    return res.status(403).json({ message: "Clients can view only their own profile" });
  }

  const client = await models.Client.findOne({ id: Number(req.params.id) }).lean();
  if (!client) return res.status(404).json({ message: "Client not found" });

  res.json(toPublicClient(client));
}

export async function createClient(req, res) {
  const body = req.body || {};
  const name = body.name?.trim();
  const username = body.username?.trim();
  const email = normalizeEmail(body.email);
  if (!name) return res.status(400).json({ message: "Client name is required" });
  if (!username) return res.status(400).json({ message: "Username is required" });
  if (typeof body.password !== "string" || body.password.trim().length < 8) {
    return res.status(400).json({ message: "Password must contain at least 8 characters" });
  }
  if (!isValidEmail(email)) return res.status(400).json({ message: "A valid client email is required" });

  const alreadyExists = await models.User.exists({
    username: new RegExp(`^${escapeRegex(username)}$`, "i"),
  });
  if (alreadyExists) {
    return res.status(409).json({ message: "A user with this username already exists" });
  }
  if (await models.Client.exists({ email })) {
    return res.status(409).json({ message: "A client with this email already exists" });
  }

  const client = await models.Client.create({
    id: await nextId(models.Client),
    name,
    surname: body.surname?.trim() || "",
    username,
    password: await bcrypt.hash(body.password, 12),
    email,
    mobile: body.mobile || "",
    birthday: body.birthday || "",
    diary: [{ date: "", text: "", expanded: false }],
  });

  await syncUsersCollection();

  res.status(201).json(toPublicClient(client));
}

export async function updateClient(req, res) {
  if (req.user.role === "Client" && Number(req.params.id) !== req.user.id) {
    return res.status(403).json({ message: "Clients can update only their own profile" });
  }

  const id = Number(req.params.id);
  const existingClient = await models.Client.findOne({ id }).lean();
  if (!existingClient) return res.status(404).json({ message: "Client not found" });

  const updates = sanitizeClientUpdates(req.body || {}, req.user.role);
  if ("password" in updates && (typeof updates.password !== "string" || updates.password.length < 8)) {
    return res.status(400).json({ message: "Password must contain at least 8 characters" });
  }
  if ("email" in updates) {
    updates.email = normalizeEmail(updates.email);
    if (!isValidEmail(updates.email)) {
      return res.status(400).json({ message: "A valid client email is required" });
    }
    const emailOwner = await models.Client.exists({ email: updates.email, id: { $ne: id } });
    if (emailOwner) return res.status(409).json({ message: "A client with this email already exists" });
  }
  if (updates.password) updates.password = await bcrypt.hash(updates.password, 12);
  const client = await models.Client.findOneAndUpdate({ id }, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (updates.email && updates.email !== normalizeEmail(existingClient.email)) {
    await models.Appointment.updateMany(
      {
        $or: [
          { client_email: normalizeEmail(existingClient.email) },
          { clientId: id },
        ],
      },
      { $set: { client_email: updates.email } },
    );
  }
  await syncUsersCollection();
  res.json(toPublicClient(client));
}

export async function deleteClient(req, res) {
  const id = Number(req.params.id);
  const client = await models.Client.findOne({ id }).lean();
  if (!client) return res.status(404).json({ message: "Client not found" });

  const clientIdentities = [{ clientId: id }];
  const clientEmail = normalizeEmail(client.email);
  if (clientEmail) clientIdentities.push({ client_email: clientEmail });

  const appointments = await models.Appointment.find({ $or: clientIdentities }).select("id").lean();
  const appointmentIds = appointments.map((appointment) => appointment.id);

  if (appointmentIds.length) {
    await models.Employee.updateMany(
      { "reviews.appointmentId": { $in: appointmentIds } },
      { $pull: { reviews: { appointmentId: { $in: appointmentIds } } } },
    );
  }
  await models.Appointment.deleteMany({ $or: clientIdentities });
  await models.User.deleteOne({ sourceId: id, sourceType: "client" });
  await models.Client.deleteOne({ id });
  res.sendStatus(204);
}

export async function addDiaryNote(req, res) {
  const note = {
    date: req.body.date || new Date().toISOString().slice(0, 10),
    text: req.body.text || "",
    beautician: req.body.beautician || "",
  };

  const client = await models.Client.findOneAndUpdate(
    { id: Number(req.params.id) },
    { $push: { diary: note } },
    { new: true },
  ).lean();

  if (!client) return res.status(404).json({ message: "Client not found" });
  res.status(201).json(note);
}

export function sanitizeClientUpdates(data, role) {
  const allowedClientFields = ["name", "surname", "username", "password", "email", "mobile", "birthday"];
  const staffFields = [...allowedClientFields, "diary"];
  const allowedFields = role === "Client" ? allowedClientFields : staffFields;
  const updates = Object.fromEntries(
    allowedFields.filter((field) => data[field] !== undefined).map((field) => [field, data[field]]),
  );
  delete updates._id;
  delete updates.id;

  if (updates.diary) {
    updates.diary = updates.diary.map((note) => {
      const cleanNote = { ...note };
      delete cleanNote._id;
      return cleanNote;
    });
  }

  return updates;
}

function toPublicClient(client) {
  const plainClient = typeof client.toObject === "function" ? client.toObject() : client;
  const { password, ...publicClient } = plainClient;
  return publicClient;
}

function appointmentBelongsToClient(appointment, client) {
  if (appointment.client_email) {
    return normalizeEmail(appointment.client_email) === normalizeEmail(client.email);
  }
  return appointment.clientId === client.id;
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
