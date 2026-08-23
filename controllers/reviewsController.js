import { models } from "../db.js";

export async function getReviews(req, res) {
  const { employee } = req.query;
  const query = employee ? { name: employee } : {};
  const employees = await models.Employee.find(query).sort({ id: 1 }).lean();

  res.json(
    employees.map((e) => ({
      employee: e.name,
      average: e.reviews.length
        ? e.reviews.reduce((sum, review) => sum + Number(review.rating), 0) / e.reviews.length
        : 0,
      reviews: e.reviews,
    })),
  );
}

export async function createReview(req, res) {
  if (req.user.role !== "Client") {
    return res.status(403).json({ message: "Only clients can create reviews" });
  }

  const appointmentId = Number(req.body.appointmentId);
  const client = await models.Client.findOne({ id: req.user.id }).lean();
  const appointment = await models.Appointment.findOne({ id: appointmentId }).lean();

  if (
    !client ||
    !appointment ||
    appointment.status !== "completed" ||
    appointment.beautician !== req.params.employee ||
    !appointmentBelongsToClient(appointment, client)
  ) {
    return res.status(403).json({ message: "Reviews can be created only for your completed appointments" });
  }

  const review = {
    appointmentId,
    client: `${client.name} ${client.surname}`.trim(),
    rating: Number(req.body.rating),
    comment: req.body.comment || "",
  };

  if (!review.client || !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) {
    return res.status(400).json({ message: "Rating must be a whole number from 1 to 5" });
  }

  const employeeWithReview = await models.Employee.findOne({
    name: req.params.employee,
    "reviews.appointmentId": appointmentId,
  }).lean();
  if (employeeWithReview) {
    return res.status(409).json({ message: "A review for this appointment already exists" });
  }

  const employee = await models.Employee.findOneAndUpdate(
    { name: req.params.employee },
    { $push: { reviews: review } },
    { new: true },
  ).lean();

  if (!employee) return res.status(404).json({ message: "Employee not found" });
  res.status(201).json(review);
}

function appointmentBelongsToClient(appointment, client) {
  if (appointment.client_email) {
    return appointment.client_email.trim().toLowerCase() === (client.email || "").trim().toLowerCase();
  }
  return appointment.clientId === client.id;
}
