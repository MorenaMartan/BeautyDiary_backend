import { models, nextId, syncUsersCollection } from "../db.js";
import bcrypt from "bcrypt";

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
  res.json(employees.map(toPublicEmployee));
}

export async function getEmployee(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid employee id" });

  const employee = await models.Employee.findOne({ id }).lean();
  if (!employee) return res.status(404).json({ message: "Employee not found" });

  res.json(toPublicEmployee(employee));
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
    birthday: body.birthday || "",
    username,
    password: await bcrypt.hash(body.password || name.toLowerCase(), 12),
    role: body.role || "Beautician",
    specialties: body.specialties || [],
    treatments: body.treatments || [],
    schedule: body.schedule || emptySchedule,
    reviews: [],
    productOrders: [{ text: "", checked: false }],
    vacations: [],
  });

  await syncUsersCollection();

  res.status(201).json(toPublicEmployee(employee));
}

export async function updateEmployee(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid employee id" });

  const updates = sanitizeEmployeeUpdates(req.body || {});
  if ("password" in updates && (typeof updates.password !== "string" || updates.password.length < 8)) {
    return res.status(400).json({ message: "Password must contain at least 8 characters" });
  }
  if (updates.password) updates.password = await bcrypt.hash(updates.password, 12);
  const employee = await models.Employee.findOneAndUpdate({ id }, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!employee) return res.status(404).json({ message: "Employee not found" });
  await syncUsersCollection();
  res.json(toPublicEmployee(employee));
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

  const canManageProfile =
    req.user.role === "Admin" ||
    (req.user.role === "Beautician" && req.user.type === "employee" && req.user.id === id);
  if (!canManageProfile) {
    return res.status(403).json({ message: "Employees can update only their own profile" });
  }

  const allowedFields = ["name", "surname", "email", "mobile", "birthday", "password"];
  const body = req.body || {};
  const updates = {};

  allowedFields.forEach((field) => {
    if (body[field] !== undefined) updates[field] = body[field];
  });

  if ("password" in updates && (typeof updates.password !== "string" || updates.password.length < 8)) {
    return res.status(400).json({ message: "Password must contain at least 8 characters" });
  }
  if (updates.password) updates.password = await bcrypt.hash(updates.password, 12);

  const employee = await models.Employee.findOneAndUpdate({ id }, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!employee) return res.status(404).json({ message: "Employee not found" });
  await syncUsersCollection();
  res.json(toPublicEmployee(employee));
}

export async function updateEmployeeTreatments(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid employee id" });

  const canManageTreatments =
    req.user.role === "Admin" ||
    (req.user.role === "Beautician" && req.user.type === "employee" && req.user.id === id);
  if (!canManageTreatments) {
    return res.status(403).json({ message: "Employees can update only their own treatments" });
  }

  const treatments = req.body.treatments;
  if (!Array.isArray(treatments) || treatments.some((treatment) => typeof treatment !== "string" || !treatment.trim())) {
    return res.status(400).json({ message: "Treatments must be a list of treatment names" });
  }

  const uniqueTreatments = [...new Set(treatments.map((treatment) => treatment.trim()))];
  const existingTreatmentCount = await models.Treatment.countDocuments({ name: { $in: uniqueTreatments } });
  if (existingTreatmentCount !== uniqueTreatments.length) {
    return res.status(400).json({ message: "One or more selected treatments do not exist" });
  }

  const employee = await models.Employee.findOneAndUpdate(
    { id },
    { treatments: uniqueTreatments, specialties: [] },
    { new: true, runValidators: true },
  ).lean();

  if (!employee) return res.status(404).json({ message: "Employee not found" });
  res.json(toPublicEmployee(employee));
}

export async function updateEmployeeSchedule(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid employee id" });

  const canManageSchedule =
    req.user.role === "Admin" ||
    (req.user.role === "Beautician" && req.user.type === "employee" && req.user.id === id);
  if (!canManageSchedule) {
    return res.status(403).json({ message: "Employees can update only their own schedule" });
  }

  const schedule = req.body.schedule;
  if (!isValidSchedule(schedule)) {
    return res.status(400).json({ message: "Enter a valid start and end time for every working day" });
  }

  const employee = await models.Employee.findOneAndUpdate(
    { id },
    { schedule },
    { new: true, runValidators: true },
  ).lean();

  if (!employee) return res.status(404).json({ message: "Employee not found" });
  res.json(toPublicEmployee(employee));
}

export async function updateEmployeeVacations(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid employee id" });

  const canManageVacations =
    req.user.role === "Admin" ||
    (req.user.role === "Beautician" && req.user.type === "employee" && req.user.id === id);
  if (!canManageVacations) {
    return res.status(403).json({ message: "Employees can update only their own vacation days" });
  }

  const vacations = req.body.vacations;
  if (!Array.isArray(vacations) || vacations.some((date) => !isValidDateString(date))) {
    return res.status(400).json({ message: "Vacation days must contain valid dates" });
  }

  const uniqueVacations = [...new Set(vacations)].sort();
  const existingEmployee = await models.Employee.findOne({ id }).select("vacationAllowance").lean();
  if (!existingEmployee) return res.status(404).json({ message: "Employee not found" });

  const vacationAllowance = existingEmployee.vacationAllowance ?? 20;
  if (uniqueVacations.length > vacationAllowance) {
    return res.status(400).json({
      message: `This employee can select up to ${vacationAllowance} vacation days`,
    });
  }

  const employee = await models.Employee.findOneAndUpdate(
    { id },
    { vacations: uniqueVacations },
    { new: true, runValidators: true },
  ).lean();

  if (!employee) return res.status(404).json({ message: "Employee not found" });
  res.json(toPublicEmployee(employee));
}

export async function updateVacationAllowance(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid employee id" });

  const vacationAllowance = req.body.vacationAllowance;
  if (!Number.isInteger(vacationAllowance) || vacationAllowance < 0 || vacationAllowance > 365) {
    return res.status(400).json({ message: "Vacation allowance must be a whole number between 0 and 365" });
  }

  const existingEmployee = await models.Employee.findOne({ id }).select("vacations").lean();
  if (!existingEmployee) return res.status(404).json({ message: "Employee not found" });
  if ((existingEmployee.vacations?.length || 0) > vacationAllowance) {
    return res.status(400).json({
      message: "Vacation allowance cannot be lower than the number of already selected days",
    });
  }

  const employee = await models.Employee.findOneAndUpdate(
    { id },
    { vacationAllowance },
    { new: true, runValidators: true },
  ).lean();

  res.json(toPublicEmployee(employee));
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

export async function updateSpecialty(req, res) {
  const currentName = decodeURIComponent(req.params.name);
  const name = req.body.name?.trim();

  if (!name) return res.status(400).json({ message: "Specialty name is required" });
  if (name === currentName) return res.json({ name });

  const specialty = await models.Specialty.findOne({ name: currentName });
  if (!specialty) return res.status(404).json({ message: "Specialty not found" });

  const existingSpecialty = await models.Specialty.exists({
    name: new RegExp(`^${escapeRegex(name)}$`, "i"),
  });
  if (existingSpecialty) return res.status(409).json({ message: "Specialty already exists" });

  specialty.name = name;
  await specialty.save();
  await Promise.all([
    models.Employee.updateMany({ specialties: currentName }, { $set: { "specialties.$": name } }),
    models.Treatment.updateMany({ specialty: currentName }, { $set: { specialty: name } }),
  ]);

  res.json({ name });
}

function sanitizeEmployeeUpdates(data) {
  const updates = { ...data };
  delete updates._id;
  delete updates.id;
  delete updates.reviews;

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

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidSchedule(schedule) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

  return Boolean(schedule && days.every((day) => {
    const start = schedule[day]?.start;
    const end = schedule[day]?.end;
    if (start === "-" && end === "-") return true;
    if (!timePattern.test(start) || !timePattern.test(end)) return false;
    return toMinutes(start) < toMinutes(end);
  }));
}

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPublicEmployee(employee) {
  const plainEmployee = typeof employee.toObject === "function" ? employee.toObject() : employee;
  const { password, ...publicEmployee } = plainEmployee;
  return publicEmployee;
}
