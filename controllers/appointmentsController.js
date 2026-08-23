import { models, nextId } from "../db.js";
import { dayName, overlaps, toMinutes, toTime } from "../utils/time.js";

const defaultLoyaltySettings = {
  eurosSpent: 15,
  pointsEarned: 1,
  pointsRequired: 10,
  discountPercentage: 10,
};

export async function getAppointments(req, res) {
  const { date, month, beautician, client, status } = req.query;
  const query = {};
  let currentClient = null;

  if (date) query.dayandhour = new RegExp(`^${escapeRegex(date)}`);
  if (month) query.dayandhour = new RegExp(`^${escapeRegex(month)}`);
  if (beautician) query.beautician = beautician;
  if (status) query.status = status;

  if (req.user.role === "Client") {
    currentClient = await models.Client.findOne({ id: req.user.id }).lean();
    if (!currentClient) return res.status(403).json({ message: "Client account not found" });
  }

  let appointments = await models.Appointment.find(query).sort({ dayandhour: 1 }).lean();

  if (client && req.user.role !== "Client") {
    appointments = appointments.filter((appointment) =>
      `${appointment.client_name} ${appointment.client_surname}`.toLowerCase().includes(client.toLowerCase()),
    );
  }

  if (currentClient) {
    appointments = appointments.flatMap((appointment) => {
      const isOwnAppointment = clientMatchesAppointment(currentClient, appointment);
      if (isOwnAppointment) return [appointment];
      if (appointment.status === "cancelled") return [];

      return [{
        dayandhour: appointment.dayandhour,
        beautician: appointment.beautician,
        duration: appointment.duration,
        status: "booked",
        isBusy: true,
      }];
    });
  }

  res.json(appointments);
}

export async function createAppointment(req, res) {
  const treatment = await findTreatment(req.body.treatment);
  const appointmentEmployee = await models.Employee.findOne(employeeIdentityQuery(req.body)).lean();
  let appointmentClient;

  if (req.user.role === "Client") {
    appointmentClient = await models.Client.findOne({ id: req.user.id }).lean();
    if (!appointmentClient) return res.status(403).json({ message: "Client account not found" });
  } else {
    const clientEmail = normalizeEmail(req.body.client_email);
    if (!clientEmail) return res.status(400).json({ message: "Client email is required" });

    appointmentClient = await models.Client.findOne({ email: clientEmail }).lean();
    if (!appointmentClient) return res.status(400).json({ message: "A client with this email does not exist" });
  }

  const useBeautyPoints = req.body.useBeautyPoints === true;
  if (useBeautyPoints && req.user.role !== "Client") {
    return res.status(403).json({ message: "Only clients can redeem Beauty Points" });
  }

  const loyaltySettings = useBeautyPoints
    ? (await models.LoyaltySettings.findOne({ key: "default" }).lean()) || defaultLoyaltySettings
    : null;
  const originalPrice = treatment?.price ?? 0;

  const appointment = {
    id: await nextId(models.Appointment),
    client_name: appointmentClient.name,
    client_surname: appointmentClient.surname,
    client_email: normalizeEmail(appointmentClient.email),
    clientId: appointmentClient.id,
    treatment: req.body.treatment,
    dayandhour: req.body.dayandhour,
    beautician: appointmentEmployee?.name || req.body.beautician,
    beautician_surname: appointmentEmployee?.surname || "",
    beautician_email: normalizeEmail(appointmentEmployee?.email),
    beauticianId: appointmentEmployee?.id,
    price: useBeautyPoints
      ? calculateDiscountedPrice(originalPrice, loyaltySettings.discountPercentage)
      : originalPrice,
    originalPrice,
    duration: treatment?.duration ?? 60,
    status: "booked",
    earningsAmount: 0,
    beautyPointsRedeemed: useBeautyPoints ? loyaltySettings.pointsRequired : 0,
    discountPercentage: useBeautyPoints ? loyaltySettings.discountPercentage : 0,
  };

  if (!appointment.client_name || !appointment.treatment || !appointment.dayandhour || !appointment.beautician) {
    return res.status(400).json({ message: "Client, treatment, day/time and beautician are required" });
  }

  const availabilityError = await validateAppointmentAvailability(appointment, treatment, appointmentEmployee);
  if (availabilityError) {
    return res.status(400).json({ message: availabilityError });
  }

  if (await isAppointmentOverlapping(appointment)) {
    return res.status(409).json({ message: "The beautician or client already has an overlapping appointment" });
  }

  let reservedPoints = 0;
  if (useBeautyPoints) {
    const availablePoints = calculateAvailableBeautyPoints(appointmentClient, loyaltySettings);
    if (availablePoints < loyaltySettings.pointsRequired) {
      return res.status(409).json({ message: "You do not have enough Beauty Points for this discount" });
    }

    const updatedClient = await models.Client.findOneAndUpdate(
      { id: appointmentClient.id, spentBeautyPoints: appointmentClient.spentBeautyPoints || 0 },
      { $inc: { spentBeautyPoints: loyaltySettings.pointsRequired } },
      { new: true, runValidators: true },
    ).lean();

    if (!updatedClient) {
      return res.status(409).json({ message: "Beauty Points balance changed. Please try again" });
    }
    reservedPoints = loyaltySettings.pointsRequired;
  }

  try {
    const createdAppointment = await models.Appointment.create(appointment);
    res.status(201).json(createdAppointment);
  } catch (error) {
    if (reservedPoints) {
      await models.Client.updateOne(
        { id: appointmentClient.id },
        { $inc: { spentBeautyPoints: -reservedPoints } },
      );
    }
    throw error;
  }
}

function employeeIdentityQuery(body) {
  const beauticianId = Number(body.beauticianId);
  if (Number.isInteger(beauticianId) && beauticianId > 0) return { id: beauticianId };

  const beauticianEmail = normalizeEmail(body.beautician_email);
  if (beauticianEmail) return { email: beauticianEmail };

  return { name: body.beautician };
}

export async function updateAppointment(req, res) {
  const id = Number(req.params.id);
  const existingAppointment = await models.Appointment.findOne({ id }).lean();
  if (!existingAppointment) return res.status(404).json({ message: "Appointment not found" });

  const requestedFields = Object.keys(req.body || {});
  if (requestedFields.some((field) => field !== "status")) {
    return res.status(400).json({ message: "Only appointment attendance status can be updated" });
  }

  const status = req.body?.status;
  if (!["completed", "no_show"].includes(status)) {
    return res.status(400).json({ message: "Status must be completed or no-show" });
  }
  if (existingAppointment.status !== "booked") {
    return res.status(409).json({ message: "Only booked appointments can receive an attendance status" });
  }
  if (!appointmentHasStarted(existingAppointment.dayandhour)) {
    return res.status(400).json({ message: "An appointment can be completed or marked as no-show only after it has started" });
  }

  const isCompletion = status === "completed";
  const updates = {
    status,
    earningsAmount: isCompletion ? Number(existingAppointment.price || 0) : 0,
  };
  const appointment = await models.Appointment.findOneAndUpdate({ id, status: "booked" }, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!appointment) {
    return res.status(409).json({ message: "Appointment status changed. Please try again" });
  }

  if (isCompletion) {
    const clientIncrements = { termins: 1 };
    if (!appointment.beautyPointsRedeemed) {
      clientIncrements.wallet = appointment.price;
    }

    await models.Client.updateOne(
      clientQueryForAppointment(appointment),
      { $inc: clientIncrements },
    );
  }

  res.json(appointment);
}

export async function cancelAppointment(req, res) {
  const id = Number(req.params.id);
  const existingAppointment = await models.Appointment.findOne({ id }).lean();
  if (!existingAppointment) return res.status(404).json({ message: "Appointment not found" });

  if (req.user.role === "Client") {
    const currentClient = await models.Client.findOne({ id: req.user.id }).lean();
    if (!currentClient || !clientMatchesAppointment(currentClient, existingAppointment)) {
      return res.status(403).json({ message: "Clients can cancel only their own appointments" });
    }
  }

  const startsAt = new Date(existingAppointment.dayandhour.replace(" ", "T"));
  const minimumCancellationTime = 24 * 60 * 60 * 1000;
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
    return res.status(400).json({ message: "Appointments cannot be cancelled after they have started" });
  }
  if (existingAppointment.status !== "booked") {
    return res.status(409).json({ message: "Only booked appointments can be cancelled" });
  }

  const cancellationFee = startsAt.getTime() - Date.now() <= minimumCancellationTime
    ? calculateCancellationFee(existingAppointment.price)
    : 0;

  const appointment = await models.Appointment.findOneAndUpdate(
    { id, status: "booked" },
    { status: "cancelled", cancellationFee, earningsAmount: cancellationFee },
    { new: true },
  ).lean();

  if (!appointment) {
    return res.status(409).json({ message: "Only booked appointments can be cancelled" });
  }

  if (cancellationFee) {
    await models.Client.updateOne(
      clientQueryForAppointment(existingAppointment),
      { $inc: { wallet: cancellationFee, cancelled: 1 } },
    );
  } else {
    await models.Client.updateOne(
      clientQueryForAppointment(existingAppointment),
      { $inc: { cancelled: 1 } },
    );
  }

  res.json(appointment);
}

export async function deleteAppointment(req, res) {
  const id = Number(req.params.id);
  const existingAppointment = await models.Appointment.findOne({ id }).lean();
  if (!existingAppointment) return res.status(404).json({ message: "Appointment not found" });
  if (existingAppointment.status === "completed") {
    return res.status(409).json({ message: "Completed appointments cannot be deleted" });
  }

  const appointment = await models.Appointment.findOneAndDelete({ id, status: { $ne: "completed" } });
  if (!appointment) return res.status(404).json({ message: "Appointment not found" });

  res.sendStatus(204);
}

export async function getAvailability(req, res) {
  const { date, treatment } = req.query;
  const selectedTreatment = await findTreatment(treatment);

  if (!date || !selectedTreatment) {
    return res.status(400).json({ message: "Date and treatment are required" });
  }

  const employees = await models.Employee.find({
    $or: [
      { treatments: selectedTreatment.name },
      { treatments: { $size: 0 }, specialties: selectedTreatment.specialty },
      { treatments: { $exists: false }, specialties: selectedTreatment.specialty },
    ],
  }).lean();
  const appointments = await models.Appointment.find({
    dayandhour: new RegExp(`^${escapeRegex(date)}`),
  }).lean();

  const available = employees.map((employee) => ({
    beautician: employee.name,
    beautician_surname: employee.surname || "",
    beautician_email: normalizeEmail(employee.email),
    beauticianId: employee.id,
    times: getAvailableTimes(employee, date, selectedTreatment.duration, appointments),
  }));

  res.json(available);
}

async function findTreatment(name) {
  return models.Treatment.findOne({ name: new RegExp(`^${escapeRegex(name || "")}$`, "i") }).lean();
}

async function validateAppointmentAvailability(appointment, treatment, selectedEmployee) {
  if (!treatment) return "Selected treatment does not exist";

  const [date, time] = appointment.dayandhour.split(" ");
  if (!date || !time || !/^\d{2}:\d{2}$/.test(time)) return "Invalid appointment date or time";
  if (!isFutureAppointment(appointment.dayandhour)) return "Appointments can be booked only in the future";

  const employee = selectedEmployee || await models.Employee.findOne({ name: appointment.beautician }).lean();
  if (!employee) return "Selected beautician does not exist";
  if (!employeeCanPerformTreatment(employee, treatment)) {
    return "Selected beautician is not qualified for this treatment";
  }
  if ((employee.vacations || []).some((vacation) =>
    (typeof vacation === "string" ? vacation : vacation.date) === date)) {
    return "Selected beautician is on vacation on this day";
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

export function employeeCanPerformTreatment(employee, treatment) {
  if (employee.treatments?.length) return employee.treatments.includes(treatment.name);
  return employee.specialties?.includes(treatment.specialty) || false;
}

function getAvailableTimes(employee, date, duration, appointments) {
  const isOnVacation = (employee.vacations || []).some((vacation) =>
    (typeof vacation === "string" ? vacation : vacation.date) === date,
  );
  if (isOnVacation) return [];

  const schedule = employee.schedule?.[dayName(date)];
  if (!schedule || schedule.start === "-" || schedule.end === "-") return [];

  const times = [];
  const start = toMinutes(schedule.start);
  const end = toMinutes(schedule.end);

  for (let minutes = start; minutes + duration <= end; minutes += 15) {
    const time = toTime(minutes);
    if (!isFutureAppointment(`${date} ${time}`)) continue;
    const overlapsExisting = appointments.some((appointment) => {
      if (!isBlockingAppointment(appointment)) return false;
      const isSameEmployee = appointment.beauticianId
        ? appointment.beauticianId === employee.id
        : appointment.beautician === employee.name;
      if (!isSameEmployee) return false;

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
  const identities = [
    { beauticianId: appointment.beauticianId },
    appointment.client_email
      ? { client_email: normalizeEmail(appointment.client_email) }
      : { clientId: appointment.clientId },
  ];
  if (!appointment.beauticianId) identities[0] = { beautician: appointment.beautician };
  const query = {
    dayandhour: new RegExp(`^${escapeRegex(date)}`),
    $or: identities,
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
  return appointment.status !== "cancelled";
}

export function appointmentHasStarted(dayandhour, now = Date.now()) {
  const startsAt = new Date(dayandhour.replace(" ", "T"));
  return !Number.isNaN(startsAt.getTime()) && startsAt.getTime() <= now;
}

export function isFutureAppointment(dayandhour, now = Date.now()) {
  const startsAt = new Date(dayandhour.replace(" ", "T"));
  return !Number.isNaN(startsAt.getTime()) && startsAt.getTime() > now;
}

export function calculateCancellationFee(price) {
  return Number(price || 0) / 2;
}

export function calculateAvailableBeautyPoints(client, settings = defaultLoyaltySettings) {
  const earnedPoints =
    Math.floor(Number(client?.wallet || 0) / Number(settings.eurosSpent)) * Number(settings.pointsEarned);
  return Math.max(0, earnedPoints - Number(client?.spentBeautyPoints || 0));
}

export function calculateDiscountedPrice(price, discountPercentage) {
  return Math.round(Number(price || 0) * (1 - Number(discountPercentage || 0) / 100) * 100) / 100;
}

function clientMatchesAppointment(client, appointment) {
  if (appointment.client_email) {
    return normalizeEmail(appointment.client_email) === normalizeEmail(client.email);
  }
  return appointment.clientId === client.id;
}

function clientQueryForAppointment(appointment) {
  if (appointment.client_email) return { email: normalizeEmail(appointment.client_email) };
  return { id: appointment.clientId };
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
