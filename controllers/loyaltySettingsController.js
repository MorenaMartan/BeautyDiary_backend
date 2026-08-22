import { models } from "../db.js";

export async function getLoyaltySettings(req, res) {
  const settings = await models.LoyaltySettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { new: true, upsert: true, runValidators: true },
  ).lean();
  res.json(settings);
}

export async function updateLoyaltySettings(req, res) {
  const { eurosSpent, pointsEarned, pointsRequired, discountPercentage } = req.body;
  const values = { eurosSpent: Number(eurosSpent), pointsEarned: Number(pointsEarned), pointsRequired: Number(pointsRequired), discountPercentage: Number(discountPercentage) };
  if (!Object.values(values).every(Number.isFinite) || values.eurosSpent < 1 || values.pointsEarned < 1 || values.pointsRequired < 1 || values.discountPercentage < 1 || values.discountPercentage > 100) {
    return res.status(400).json({ message: "Enter positive values and a discount between 1 and 100%." });
  }
  const settings = await models.LoyaltySettings.findOneAndUpdate({ key: "default" }, values, { new: true, upsert: true, runValidators: true }).lean();
  res.json(settings);
}
