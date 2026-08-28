import { models, nextId, syncUserRecord, syncUsersCollection } from "../db.js";
import bcrypt from "bcrypt";
import { dayName } from "../utils/time.js";

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
  const surname = body.surname?.trim();
  if (!name) return res.status(400).json({ message: "Employee name is required" });
  if (!surname) return res.status(400).json({ message: "Employee surname is required" });
  if (!isValidMobile(body.mobile)) {
    return res.status(400).json({ message: "Mobile number can contain only digits" });
  }
  if (!isValidBirthday(body.birthday)) {
    return res.status(400).json({ message: "Employee must be at least 18 years old" });
  }

  const employeesWithSameName = await models.Employee.find({
    name: new RegExp(`^${escapeRegex(name)}$`, "i"),
  }).lean();
  const employeeId = await nextId(models.Employee);
  const usernameAssignments = buildEmployeeUsernameAssignments([
    ...employeesWithSameName,
    { id: employeeId, name, surname },
  ]);
  if (!usernameAssignments) {
    return res.status(409).json({
      message: "Employees with the same name must have different surname initials",
    });
  }

  const groupIds = usernameAssignments.map((assignment) => assignment.id);
  for (const assignment of usernameAssignments) {
    const alreadyExists = await models.User.exists({
      username: new RegExp(`^${escapeRegex(assignment.username)}$`, "i"),
      $nor: [{ sourceType: "employee", sourceId: { $in: groupIds } }],
    });
    if (alreadyExists) {
      return res.status(409).json({ message: `Username ${assignment.username} already exists` });
    }
  }

  const username = usernameAssignments.find((assignment) => assignment.id === employeeId).username;

  const employee = await models.Employee.create({
    id: employeeId,
    name,
    surname,
    email: body.email || "",
    mobile: body.mobile || "",
    birthday: body.birthday || "",
    username,
    password: await bcrypt.hash(username.toLocaleLowerCase("hr-HR"), 12),
    role: body.role || "Beautician",
    specialties: body.specialties || [],
    treatments: body.treatments || [],
    schedule: body.schedule || emptySchedule,
    reviews: [],
    productOrders: [{ text: "", checked: false }],
    vacations: [],
  });

  const existingUsernameUpdates = usernameAssignments.filter((assignment) => assignment.id !== employeeId);
  if (existingUsernameUpdates.length) {
    await models.Employee.bulkWrite(existingUsernameUpdates.map((assignment) => ({
      updateOne: {
        filter: { id: assignment.id },
        update: { $set: { username: assignment.username } },
      },
    })));
  }

  await syncUsersCollection();

  res.status(201).json(toPublicEmployee(employee));
}

function buildEmployeeUsernameAssignments(employees) {
  const hasDuplicateName = employees.length > 1;
  if (hasDuplicateName && employees.some((employee) => !employee.surname?.trim())) return null;

  const assignments = employees.map((employee) => ({
    id: employee.id,
    username: hasDuplicateName
      ? `${employee.name}${employee.surname?.trim().charAt(0).toLocaleUpperCase("hr-HR") || ""}`
      : employee.name,
  }));
  const usernames = assignments.map((assignment) => assignment.username.toLocaleLowerCase("hr-HR"));

  if (usernames.some((username) => !username) || new Set(usernames).size !== usernames.length) return null;
  return assignments;
}

export async function updateEmployee(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid employee id" });

  const updates = sanitizeEmployeeUpdates(req.body || {});
  if ("password" in updates && (typeof updates.password !== "string" || updates.password.length < 8)) {
    return res.status(400).json({ message: "Password must contain at least 8 characters" });
  }
  if ("mobile" in updates && !isValidMobile(updates.mobile)) {
    return res.status(400).json({ message: "Mobile number can contain only digits" });
  }
  if ("birthday" in updates && updates.birthday !== "" && !isValidBirthday(updates.birthday)) {
    return res.status(400).json({ message: "Employee must be at least 18 years old" });
  }
  const existingEmployee = await models.Employee.findOne({ id }).lean();
  if (!existingEmployee) return res.status(404).json({ message: "Employee not found" });

  if (updates.password) updates.password = await bcrypt.hash(updates.password, 12);
  const employee = await models.Employee.findOneAndUpdate({ id }, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!employee) return res.status(404).json({ message: "Employee not found" });
  await syncEmployeeAppointments(existingEmployee, employee);
  await syncUsersCollection();
  res.json(toPublicEmployee(employee));
}

export async function deleteEmployee(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid employee id" });

  const employee = await models.Employee.findOne({ id }).lean();
  if (!employee) return res.status(404).json({ message: "Employee not found" });

  const bookedAppointments = await findBookedAppointmentsForEmployee(employee);
  const hasFutureAppointment = bookedAppointments.some((appointment) => {
    const startsAt = new Date(appointment.dayandhour?.replace(" ", "T"));
    return !Number.isNaN(startsAt.getTime()) && startsAt.getTime() > Date.now();
  });
  if (hasFutureAppointment) {
    return res.status(409).json({
      message: "Employee cannot be deleted while future booked appointments exist",
    });
  }

  const deletion = await models.Employee.deleteOne({ id });
  if (!deletion.deletedCount) return res.status(404).json({ message: "Employee not found" });

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

  const existingEmployee = await models.Employee.findOne({ id }).lean();
  if (!existingEmployee) return res.status(404).json({ message: "Employee not found" });

  const allowedFields = ["name", "surname", "email", "mobile", "birthday", "password"];
  const body = req.body || {};
  const updates = {};

  allowedFields.forEach((field) => {
    if (body[field] !== undefined) updates[field] = body[field];
  });

  if ("password" in updates && (typeof updates.password !== "string" || updates.password.length < 8)) {
    return res.status(400).json({ message: "Password must contain at least 8 characters" });
  }
  if ("mobile" in updates && !isValidMobile(updates.mobile)) {
    return res.status(400).json({ message: "Mobile number can contain only digits" });
  }
  if ("birthday" in updates && updates.birthday !== "" && !isValidBirthday(updates.birthday)) {
    return res.status(400).json({ message: "Employee must be at least 18 years old" });
  }
  if (updates.password) updates.password = await bcrypt.hash(updates.password, 12);

  const employee = await models.Employee.findOneAndUpdate({ id }, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!employee) return res.status(404).json({ message: "Employee not found" });
  await syncEmployeeAppointments(existingEmployee, employee);
  await syncUserRecord(employee, "employee");
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

  const existingEmployee = await models.Employee.findOne({ id }).lean();
  if (!existingEmployee) return res.status(404).json({ message: "Employee not found" });
  const bookedAppointments = await findBookedAppointmentsForEmployee(existingEmployee);
  if (bookedAppointments.some((appointment) => appointmentConflictsWithSchedule(appointment, schedule))) {
    return res.status(409).json({
      message: "The schedule cannot be changed because it conflicts with an existing booked appointment",
    });
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
  const existingEmployee = await models.Employee.findOne({ id }).select("id name vacations vacationAllowance").lean();
  if (!existingEmployee) return res.status(404).json({ message: "Employee not found" });

  const vacationAllowance = existingEmployee.vacationAllowance ?? 20;
  if (uniqueVacations.length > vacationAllowance) {
    return res.status(400).json({
      message: `This employee can select up to ${vacationAllowance} vacation days`,
    });
  }

  const addedVacations = uniqueVacations.filter((date) => !(existingEmployee.vacations || []).includes(date));
  if (addedVacations.length) {
    const bookedAppointments = await findBookedAppointmentsForEmployee(existingEmployee);
    const conflictingAppointment = bookedAppointments.some((appointment) =>
      addedVacations.includes(appointment.dayandhour?.split(" ")[0]),
    );
    if (conflictingAppointment) {
      return res.status(409).json({
        message: "Vacation cannot be selected while a booked appointment exists on that day",
      });
    }
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

  const treatment = await models.Treatment.findOne({
    specialty: new RegExp(`^${escapeRegex(name)}$`, "i"),
  }).lean();
  if (treatment) {
    return res.status(409).json({
      message: "Move or delete this specialty's treatments before deleting the specialty",
    });
  }

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

async function findBookedAppointmentsForEmployee(employee) {
  const employeesWithSameName = await models.Employee.countDocuments({ name: employee.name });
  const identities = [{ beauticianId: employee.id }];
  if (employeesWithSameName === 1) {
    identities.push({ beauticianId: null, beautician: employee.name });
  }

  return models.Appointment.find({
    status: "booked",
    $or: identities,
  }).lean();
}

function appointmentConflictsWithSchedule(appointment, schedule) {
  const startsAt = new Date(appointment.dayandhour?.replace(" ", "T"));
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) return false;

  const [date, time] = appointment.dayandhour.split(" ");
  const workingHours = schedule[dayName(date)];
  if (!workingHours || workingHours.start === "-" || workingHours.end === "-") return true;

  const start = toMinutes(time);
  const end = start + Number(appointment.duration || 60);
  return start < toMinutes(workingHours.start) || end > toMinutes(workingHours.end);
}

async function syncEmployeeAppointments(existingEmployee, employee) {
  const identityChanged =
    existingEmployee.name !== employee.name ||
    (existingEmployee.surname || "") !== (employee.surname || "") ||
    (existingEmployee.email || "").trim().toLowerCase() !== (employee.email || "").trim().toLowerCase();
  if (!identityChanged) return;

  const employeesWithOldName = await models.Employee.countDocuments({ name: existingEmployee.name });
  const identities = [{ beauticianId: employee.id }];
  const nameChanged = existingEmployee.name !== employee.name;
  const canSyncLegacyAppointments = nameChanged
    ? employeesWithOldName === 0
    : employeesWithOldName === 1;
  if (canSyncLegacyAppointments) {
    identities.push({ beauticianId: null, beautician: existingEmployee.name });
  }

  await models.Appointment.updateMany(
    {
      $or: identities,
    },
    {
      $set: {
        beauticianId: employee.id,
        beautician: employee.name,
        beautician_surname: employee.surname || "",
        beautician_email: (employee.email || "").trim().toLowerCase(),
      },
    },
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidMobile(value) {
  return value === undefined || value === "" || (typeof value === "string" && /^\d+$/.test(value));
}

function isValidBirthday(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const birthday = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    birthday.getUTCFullYear() === year &&
    birthday.getUTCMonth() === month - 1 &&
    birthday.getUTCDate() === day;
  const adultBirthDate = new Date();
  adultBirthDate.setUTCHours(0, 0, 0, 0);
  adultBirthDate.setUTCFullYear(adultBirthDate.getUTCFullYear() - 18);
  return isRealDate && birthday <= adultBirthDate;
}

function toPublicEmployee(employee) {
  const plainEmployee = typeof employee.toObject === "function" ? employee.toObject() : employee;
  const { password, ...publicEmployee } = plainEmployee;
  return publicEmployee;
}
