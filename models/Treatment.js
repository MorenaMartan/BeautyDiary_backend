import mongoose from "mongoose";

const treatmentSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true, unique: true, index: true },
    specialty: { type: String, required: true },
    price: { type: Number, required: true },
    duration: { type: Number, required: true },
  },
  { id: false, versionKey: false },
);

export const Treatment = mongoose.model("Treatment", treatmentSchema);
