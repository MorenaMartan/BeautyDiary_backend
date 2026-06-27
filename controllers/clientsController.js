import { models, nextId, syncUsersCollection } from "../db.js";

export async function getClients(req, res) {
  const clients = await models.Client.find().sort({ id: 1 }).lean();
  res.json(clients);
}

export async function getClientStats(req, res) {
  const now = new Date();
  const daysAgo = (days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const appointmentDate = (appointment) => new Date(appointment.dayandhour.split(" ")[0]);
  const fullName = (client) => `${client.name} ${client.surname}`;
  const clients = await models.Client.find().lean();
  const appointments = await models.Appointment.find().lean();

  const recentAppointments = appointments.filter((appointment) => appointmentDate(appointment) >= daysAgo(30));
  const recentCancelled = appointments.filter(
    (appointment) => appointment.status === "cancelled" && appointmentDate(appointment) >= daysAgo(90),
  );

  const topSpenders = clients
    .map((client) => ({
      ...client,
      spentLast30Days: recentAppointments
        .filter((appointment) => `${appointment.client_name} ${appointment.client_surname}` === fullName(client))
        .reduce((sum, appointment) => sum + Number(appointment.price || 0), 0),
    }))
    .sort((a, b) => b.spentLast30Days - a.spentLast30Days)
    .slice(0, 5);

  const mostCancelled = clients
    .map((client) => ({
      ...client,
      cancelledLast90Days: recentCancelled.filter(
        (appointment) => `${appointment.client_name} ${appointment.client_surname}` === fullName(client),
      ).length,
    }))
    .sort((a, b) => b.cancelledLast90Days - a.cancelledLast90Days)
    .slice(0, 5);

  const newClients = clients.filter((client) => client.createdAt && new Date(client.createdAt) >= daysAgo(30));

  const inactiveClients = clients.filter((client) => {
    const clientAppointments = appointments.filter(
      (appointment) => `${appointment.client_name} ${appointment.client_surname}` === fullName(client),
    );

    if (!clientAppointments.length) return true;
    return Math.max(...clientAppointments.map((appointment) => appointmentDate(appointment).getTime())) < daysAgo(60).getTime();
  });

  res.json({ topSpenders, mostCancelled, newClients, inactiveClients });
}

export async function getClient(req, res) {
  const client = await models.Client.findOne({ id: Number(req.params.id) }).lean();
  if (!client) return res.status(404).json({ message: "Client not found" });

  res.json(client);
}

export async function createClient(req, res) {
  const body = req.body || {};
  const name = body.name || "New";
  const client = await models.Client.create({
    id: await nextId(models.Client),
    name,
    surname: body.surname || "Client",
    username: body.username || name,
    password: body.password || name.toLowerCase(),
    email: body.email || "",
    mobile: body.mobile || "",
    birthday: body.birthday || "",
    diary: [{ date: "", text: "", expanded: false }],
  });

  await syncUsersCollection();

  res.status(201).json(client);
}

export async function updateClient(req, res) {
  const updates = sanitizeClientUpdates(req.body || {});
  const client = await models.Client.findOneAndUpdate({ id: Number(req.params.id) }, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!client) return res.status(404).json({ message: "Client not found" });
  await syncUsersCollection();
  res.json(client);
}

export async function deleteClient(req, res) {
  const client = await models.Client.findOneAndDelete({ id: Number(req.params.id) });
  if (!client) return res.status(404).json({ message: "Client not found" });

  await models.User.deleteOne({ sourceId: client.id, sourceType: "client" });
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

function sanitizeClientUpdates(data) {
  const updates = { ...data };
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
