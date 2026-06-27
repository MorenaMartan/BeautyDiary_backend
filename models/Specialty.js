import mongoose from "mongoose";

const specialtySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
  },
  { id: false, versionKey: false },
);

export const Specialty = mongoose.model("Specialty", specialtySchema);
