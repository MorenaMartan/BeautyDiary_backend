import { models } from "../db.js";

function summarize(appointments) {
  return appointments.reduce(
    (summary, appointment) => {
      const price = Number(appointment.price || 0);
      const hours = Number(appointment.duration || 60) / 60;

      summary.total += price;
      summary.byBeautician[appointment.beautician] = (summary.byBeautician[appointment.beautician] || 0) + price;
      summary.bookedHours[appointment.beautician] = (summary.bookedHours[appointment.beautician] || 0) + hours;
      summary.byTreatment[appointment.treatment] = (summary.byTreatment[appointment.treatment] || 0) + 1;

      return summary;
    },
    { total: 0, byBeautician: {}, bookedHours: {}, byTreatment: {} },
  );
}

export async function getDailySales(req, res) {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const appointments = await activeAppointments({ dayandhour: new RegExp(`^${escapeRegex(date)}`) });

  res.json({ date, ...summarize(appointments), appointments });
}

export async function getMonthlySales(req, res) {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const appointments = await activeAppointments({ dayandhour: new RegExp(`^${escapeRegex(month)}`) });

  res.json({ month, ...summarize(appointments), appointments });
}

export async function getTreatmentStats(req, res) {
  const appointments = await activeAppointments();
  const stats = appointments.reduce((result, appointment) => {
    const month = appointment.dayandhour.slice(0, 7);
    if (!result[month]) result[month] = {};
    result[month][appointment.treatment] = (result[month][appointment.treatment] || 0) + 1;
    return result;
  }, {});

  res.json(stats);
}

function activeAppointments(query = {}) {
  return models.Appointment.find({ status: { $ne: "cancelled" }, ...query }).sort({ dayandhour: 1 }).lean();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
