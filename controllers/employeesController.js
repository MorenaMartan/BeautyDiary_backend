import { models, nextId, syncUsersCollection } from "../db.js";

const emptySchedule = {
  Monday: { start: "-", end: "-" },
  Tuesday: { start: "-", end: "-" },
  Wednesday: { start: "-", end: "-" },
  Thursday: { start: "-", end: "-" },
  Friday: { start: "-", end: "-" },
  Saturday: { start: "-", end: "-" },
  Sunday: { start: "-", end: "-" },
};

export async function getEmployees(req, res) {
  const employees = await models.Employee.find().sort({ id: 1 }).lean();
  res.json(employees);
}

export async function getEmployee(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid employee id" });

  const employee = await models.Employee.findOne({ id }).lean();
  if (!employee) return res.status(404).json({ message: "Employee not found" });

  res.json(employee);
}

export async function createEmployee(req, res) {
  const body = req.body || {};
  const name = body.name?.trim();
  if (!name) return res.status(400).json({ message: "Employee name is required" });

  const username = (body.username || name).trim();
  const alreadyExists = await models.User.exists({
    username: new RegExp(`^${escapeRegex(username)}$`, "i"),
  });

  if (alreadyExists) {
    return res.status(409).json({ message: "Employee with this username already exists" });
  }

  const employee = await models.Employee.create({
    id: await nextId(models.Employee),
    name,
    surname: body.surname || "",
    email: body.email || "",
    mobile: body.mobile || "",
    username,
    password: body.password || name.toLowerCase(),
    role: body.role || "Beautician",
    specialties: body.specialties || [],
    schedule: body.schedule || emptySchedule,
    reviews: [],
    productOrders: [{ text: "", checked: false }],
    vacations: [],
  });

  await syncUsersCollection();

  res.status(201).json(employee);
}

export async function updateEmployee(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid employee id" });

  const updates = sanitizeEmployeeUpdates(req.body || {});
  const employee = await models.Employee.findOneAndUpdate({ id }, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!employee) return res.status(404).json({ message: "Employee not found" });
  await syncUsersCollection();
  res.json(employee);
}

export async function deleteEmployee(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid employee id" });

  const employee = await models.Employee.findOneAndDelete({ id });
  if (!employee) return res.status(404).json({ message: "Employee not found" });

  await models.User.deleteOne({ sourceId: id, sourceType: "employee" });
  res.sendStatus(204);
}

export async function updateEmployeeProfile(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid employee id" });

  const allowedFields = ["name", "surname", "email", "mobile", "password"];
  const body = req.body || {};
  const updates = {};

  allowedFields.forEach((field) => {
    if (body[field] !== undefined) updates[field] = body[field];
  });

  if (updates.name && !body.username) {
    updates.username = updates.name;
  }

  const employee = await models.Employee.findOneAndUpdate({ id }, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!employee) return res.status(404).json({ message: "Employee not found" });
  await syncUsersCollection();
  res.json(employee);
}

export async function getSpecialties(req, res) {
  const specialties = await models.Specialty.find().sort({ name: 1 }).lean();
  res.json(specialties.map((specialty) => specialty.name));
}

export async function createSpecialty(req, res) {
  const body = req.body || {};
  const name = (typeof body === "string" ? body : body.name)?.trim();
  if (!name) return res.status(400).json({ message: "Specialty name is required" });

  const existingSpecialty = await models.Specialty.findOne({
    name: new RegExp(`^${escapeRegex(name)}$`, "i"),
  }).lean();

  if (!existingSpecialty) {
    await models.Specialty.create({ name });
  }

  const specialties = await models.Specialty.find().sort({ name: 1 }).lean();
  res.status(201).json(specialties.map((specialty) => specialty.name));
}

export async function deleteSpecialty(req, res) {
  const name = decodeURIComponent(req.params.name);

  await models.Specialty.deleteOne({ name });
  await models.Employee.updateMany({}, { $pull: { specialties: name } });

  const specialties = await models.Specialty.find().sort({ name: 1 }).lean();
  res.json(specialties.map((specialty) => specialty.name));
}

function sanitizeEmployeeUpdates(data) {
  const updates = { ...data };
  delete updates._id;
  delete updates.id;

  if (updates.reviews) {
    updates.reviews = updates.reviews.map((review) => {
      const cleanReview = { ...review };
      delete cleanReview._id;
      return cleanReview;
    });
  }

  if (updates.productOrders) {
    updates.productOrders = updates.productOrders.map((order) => {
      const cleanOrder = { ...order };
      delete cleanOrder._id;
      return cleanOrder;
    });
  }

  return updates;
}

function parseId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
