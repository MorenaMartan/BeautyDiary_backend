import { models, nextId } from "../db.js";
import { dayName, overlaps, toMinutes, toTime } from "../utils/time.js";

export async function getAppointments(req, res) {
  const { date, month, beautician, client, status } = req.query;
  const query = {};

  if (date) query.dayandhour = new RegExp(`^${escapeRegex(date)}`);
  if (month) query.dayandhour = new RegExp(`^${escapeRegex(month)}`);
  if (beautician) query.beautician = beautician;
  if (status) query.status = status;

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

  if (await isAppointmentOverlapping(appointment)) {
    return res.status(409).json({ message: "Appointment overlaps with an existing booking" });
  }

  const createdAppointment = await models.Appointment.create(appointment);
  res.status(201).json(createdAppointment);
}

export async function updateAppointment(req, res) {
  const appointment = await models.Appointment.findOneAndUpdate({ id: Number(req.params.id) }, req.body, {
    new: true,
    runValidators: true,
  }).lean();

  if (!appointment) return res.status(404).json({ message: "Appointment not found" });
  res.json(appointment);
}

export async function cancelAppointment(req, res) {
  const appointment = await models.Appointment.findOneAndUpdate(
    { id: Number(req.params.id) },
    { status: "cancelled" },
    { new: true },
  ).lean();

  if (!appointment) return res.status(404).json({ message: "Appointment not found" });
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
  const appointments = await models.Appointment.find({
    beautician: appointment.beautician,
    dayandhour: new RegExp(`^${escapeRegex(date)}`),
  }).lean();

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
