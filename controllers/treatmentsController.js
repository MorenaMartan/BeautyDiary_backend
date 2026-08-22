import { models, nextId } from "../db.js";

export async function getTreatments(req, res) {
  const treatments = await models.Treatment.find().sort({ id: 1 }).lean();
  res.json(treatments);
}

export async function createTreatment(req, res) {
  const treatment = normalizeTreatment(req.body);
  if (!treatment) {
    return res.status(400).json({ message: "Name, category, positive price and positive duration are required" });
  }

  const specialtyExists = await models.Specialty.exists({ name: treatment.specialty });
  if (!specialtyExists) {
    return res.status(400).json({ message: "Selected category does not exist" });
  }

  const createdTreatment = await models.Treatment.create({
    id: await nextId(models.Treatment),
    ...treatment,
  });

  res.status(201).json(createdTreatment);
}

export async function updateTreatment(req, res) {
  const treatment = normalizeTreatment(req.body);
  if (!treatment) {
    return res.status(400).json({ message: "Name, category, positive price and positive duration are required" });
  }

  const specialtyExists = await models.Specialty.exists({ name: treatment.specialty });
  if (!specialtyExists) {
    return res.status(400).json({ message: "Selected category does not exist" });
  }

  const existingTreatment = await models.Treatment.findOne({ id: Number(req.params.id) }).lean();
  if (!existingTreatment) return res.status(404).json({ message: "Treatment not found" });

  const updatedTreatment = await models.Treatment.findOneAndUpdate({ id: Number(req.params.id) }, treatment, {
    new: true,
    runValidators: true,
  }).lean();

  if (existingTreatment.name !== treatment.name) {
    await models.Employee.updateMany(
      { treatments: existingTreatment.name },
      { $set: { "treatments.$": treatment.name } },
    );
  }
  res.json(updatedTreatment);
}

export async function deleteTreatment(req, res) {
  const treatment = await models.Treatment.findOneAndDelete({ id: Number(req.params.id) });
  if (!treatment) return res.status(404).json({ message: "Treatment not found" });

  await models.Employee.updateMany({}, { $pull: { treatments: treatment.name } });
  res.sendStatus(204);
}

function normalizeTreatment(data = {}) {
  const name = data.name?.trim();
  const specialty = data.specialty?.trim();
  const price = Number(data.price);
  const duration = Number(data.duration);

  if (!name || !specialty || !Number.isFinite(price) || price <= 0 || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  return { name, specialty, price, duration };
}
