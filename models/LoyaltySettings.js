import mongoose from "mongoose";

const loyaltySettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    eurosSpent: { type: Number, required: true, min: 1, default: 15 },
    pointsEarned: { type: Number, required: true, min: 1, default: 1 },
    pointsRequired: { type: Number, required: true, min: 1, default: 10 },
    discountPercentage: { type: Number, required: true, min: 1, max: 100, default: 10 },
  },
  { versionKey: false },
);

export const LoyaltySettings = mongoose.model("LoyaltySettings", loyaltySettingsSchema);
