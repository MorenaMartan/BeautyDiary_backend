import { models, nextId } from "../db.js";
import { dayName, overlaps, toMinutes, toTime } from "../utils/time.js";

export async function getAppointments(req, res) {
  const { date, month, beautician, client, status } = req.query;
  const query = {};

  if (date) query.dayandhour = new RegExp(`^${escapeRegex(date)}`);
  if (month) query.dayandhour = new RegExp(`^${escapeRegex(month)}`);
  if (beautician) query.beautician = beautician;
  if (status) query.status = status;

  if (req.user.role === "Client") {
    const currentClient = await models.Client.findOne({ id: req.user.id }).lean();
    if (!currentClient) return res.status(403).json({ message: "Client account not found" });
    query.client_name = currentClient.name;
    query.client_surname = currentClient.surname;
  }

  let appointments = await models.Appointment.find(query).sort({ dayandhour: 1 }).lean();

  if (client) {
    appointments = appointments.filter((appointment) =>
      `${appointment.client_name} ${appointment.client_surname}`.toLowerCase().includes(client.toLowerCase()),
    );
  }

  res.json(appointments);
}

export async function createAppointment(req, res) {
  const treatment = await findTreatment(req.body.treatment);

  if (req.user.role === "Client") {
    const currentClient = await models.Client.findOne({ id: req.user.id }).lean();
    if (!currentClient) return res.status(403).json({ message: "Client account not found" });
    if (req.body.client_name !== currentClient.name || (req.body.client_surname || "") !== currentClient.surname) {
      return res.status(403).json({ message: "Clients can create appointments only for themselves" });
    }
  }

  const appointment = {
    id: await nextId(models.Appointment),
    client_name: req.body.client_name,
    client_surname: req.body.client_surname,
    treatment: req.body.treatment,
    dayandhour: req.body.dayandhour,
    beautician: req.body.beautician,
    price: req.body.price ?? treatment?.price ?? 0,
    duration: req.body.duration ?? treatment?.duration ?? 60,
    status: req.body.status || "booked",
    earningsAmount: req.body.earningsAmount || 0,
  };

  if (!appointment.client_name || !appointment.treatment || !appointment.dayandhour || !appointment.beautician) {
    return res.status(400).json({ message: "Client, treatment, day/time and beautician are required" });
  }

  const availabilityError = await validateAppointmentAvailability(appointment, treatment);
  if (availabilityError) {
    return res.status(400).json({ message: availabilityError });
  }

  if (await isAppointmentOverlapping(appointment)) {
    return res.status(409).json({ message: "The beautician or client already has an overlapping appointment" });
  }

  const createdAppointment = await models.Appointment.create(appointment);
  res.status(201).json(createdAppointment);
}

export async function updateAppointment(req, res) {
  const id = Number(req.params.id);
  const existingAppointment = await models.Appointment.findOne({ id }).lean();
  if (!existingAppointment) return res.status(404).json({ message: "Appointment not found" });

  const updates = { ...req.body };
  delete updates._id;
  delete updates.id;
  const updatedData = { ...existingAppointment, ...updates, id };

  if (isBlockingAppointment(updatedData)) {
    const treatment = await findTreatment(updatedData.treatment);
    const availabilityError = await validateAppointmentAvailability(updatedData, treatment);
    if (availabilityError) return res.status(400).json({ message: availabilityError });
  }

  if (isBlockingAppointment(updatedData) && (await isAppointmentOverlapping(updatedData))) {
    return res.status(409).json({ message: "The beautician or client already has an overlapping appointment" });
  }

  const appointment = await models.Appointment.findOneAndUpdate({ id }, updates, {
    new: true,
    runValidators: true,
  }).lean();

  res.json(appointment);
}

export async function cancelAppointment(req, res) {
  const id = Number(req.params.id);
  const existingAppointment = await models.Appointment.findOne({ id }).lean();
  if (!existingAppointment) return res.status(404).json({ message: "Appointment not found" });

  if (req.user.role === "Client") {
    const currentClient = await models.Client.findOne({ id: req.user.id }).lean();
    if (!currentClient || existingAppointment.client_name !== currentClient.name || existingAppointment.client_surname !== currentClient.surname) {
      return res.status(403).json({ message: "Clients can cancel only their own appointments" });
    }
  }

  const startsAt = new Date(existingAppointment.dayandhour.replace(" ", "T"));
  const minimumCancellationTime = 24 * 60 * 60 * 1000;
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() - Date.now() <= minimumCancellationTime) {
    return res.status(400).json({ message: "Appointments can be cancelled only more than 24 hours before they start" });
  }

  const appointment = await models.Appointment.findOneAndUpdate(
    { id },
    { status: "cancelled" },
    { new: true },
  ).lean();

  res.json(appointment);
}

export async function deleteAppointment(req, res) {
  const appointment = await models.Appointment.findOneAndDelete({ id: Number(req.params.id) });
  if (!appointment) return res.status(404).json({ message: "Appointment not found" });

  res.sendStatus(204);
}

export async function getAvailability(req, res) {
  const { date, treatment } = req.query;
  const selectedTreatment = await findTreatment(treatment);

  if (!date || !selectedTreatment) {
    return res.status(400).json({ message: "Date and treatment are required" });
  }

  const employees = await models.Employee.find({ specialties: selectedTreatment.specialty }).lean();
  const appointments = await models.Appointment.find({
    dayandhour: new RegExp(`^${escapeRegex(date)}`),
  }).lean();

  const available = employees.map((employee) => ({
    beautician: employee.name,
    times: getAvailableTimes(employee, date, selectedTreatment.duration, appointments),
  }));

  res.json(available);
}

async function findTreatment(name) {
  return models.Treatment.findOne({ name: new RegExp(`^${escapeRegex(name || "")}$`, "i") }).lean();
}

async function validateAppointmentAvailability(appointment, treatment) {
  if (!treatment) return "Selected treatment does not exist";

  const [date, time] = appointment.dayandhour.split(" ");
  if (!date || !time || !/^\d{2}:\d{2}$/.test(time)) return "Invalid appointment date or time";

  const employee = await models.Employee.findOne({ name: appointment.beautician }).lean();
  if (!employee) return "Selected beautician does not exist";
  if (!employee.specialties?.includes(treatment.specialty)) {
    return "Selected beautician is not qualified for this treatment";
  }

  const schedule = employee.schedule?.[dayName(date)];
  if (!schedule || schedule.start === "-" || schedule.end === "-") {
    return "Selected beautician does not work on this day";
  }

  const start = toMinutes(time);
  const end = start + Number(appointment.duration);
  if (start < toMinutes(schedule.start) || end > toMinutes(schedule.end)) {
    return "Appointment must be within the beautician's working hours";
  }

  return null;
}

function getAvailableTimes(employee, date, duration, appointments) {
  const schedule = employee.schedule?.[dayName(date)];
  if (!schedule || schedule.start === "-" || schedule.end === "-") return [];

  const times = [];
  const start = toMinutes(schedule.start);
  const end = toMinutes(schedule.end);

  for (let minutes = start; minutes + duration <= end; minutes += 15) {
    const time = toTime(minutes);
    const overlapsExisting = appointments.some((appointment) => {
      if (!isBlockingAppointment(appointment)) return false;
      if (appointment.beautician !== employee.name) return false;

      const [appointmentDate, appointmentTime] = appointment.dayandhour.split(" ");
      if (appointmentDate !== date) return false;

      return overlaps(time, duration, appointmentTime, appointment.duration || 60);
    });

    if (!overlapsExisting) times.push(time);
  }

  return times;
}

async function isAppointmentOverlapping(appointment) {
  const [date, time] = appointment.dayandhour.split(" ");
  const query = {
    dayandhour: new RegExp(`^${escapeRegex(date)}`),
    $or: [
      { beautician: appointment.beautician },
      { client_name: appointment.client_name, client_surname: appointment.client_surname },
    ],
  };

  if (appointment.id) query.id = { $ne: Number(appointment.id) };

  const appointments = await models.Appointment.find(query).lean();

  return appointments.some((existing) => {
    if (!isBlockingAppointment(existing)) return false;

    const [, existingTime] = existing.dayandhour.split(" ");
    return overlaps(time, appointment.duration, existingTime, existing.duration || 60);
  });
}

function isBlockingAppointment(appointment) {
  return appointment.status !== "cancelled" || Number(appointment.earningsAmount || 0) > 0;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
