import { models, nextId } from "../db.js";

export async function getTreatments(req, res) {
  const treatments = await models.Treatment.find().sort({ id: 1 }).lean();
  res.json(treatments);
}

export async function createTreatment(req, res) {
  if (!req.body.name || !req.body.price || !req.body.duration) {
    return res.status(400).json({ message: "Name, price and duration are required" });
  }

  const treatment = await models.Treatment.create({
    id: await nextId(models.Treatment),
    name: req.body.name,
    specialty: req.body.specialty || "Facial",
    price: Number(req.body.price),
    duration: Number(req.body.duration),
  });

  res.status(201).json(treatment);
}

export async function updateTreatment(req, res) {
  const treatment = await models.Treatment.findOneAndUpdate({ id: Number(req.params.id) }, req.body, {
    new: true,
    runValidators: true,
  }).lean();

  if (!treatment) return res.status(404).json({ message: "Treatment not found" });
  res.json(treatment);
}

export async function deleteTreatment(req, res) {
  const treatment = await models.Treatment.findOneAndDelete({ id: Number(req.params.id) });
  if (!treatment) return res.status(404).json({ message: "Treatment not found" });

  res.sendStatus(204);
}
