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
  const review = {
    client: req.body.client,
    rating: Number(req.body.rating),
    comment: req.body.comment || "",
  };

  if (!review.client || !review.rating) {
    return res.status(400).json({ message: "Client and rating are required" });
  }

  const employee = await models.Employee.findOneAndUpdate(
    { name: req.params.employee },
    { $push: { reviews: review } },
    { new: true },
  ).lean();

  if (!employee) return res.status(404).json({ message: "Employee not found" });
  res.status(201).json(review);
}
