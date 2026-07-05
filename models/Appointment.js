import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    client_name: { type: String, required: true },
    client_surname: { type: String, default: "" },
    treatment: { type: String, required: true },
    dayandhour: { type: String, required: true, index: true },
    beautician: { type: String, required: true, index: true },
    price: { type: Number, default: 0 },
    duration: { type: Number, default: 60 },
    status: { type: String, enum: ["booked", "cancelled", "completed", "no_show"], default: "booked" },
    earningsAmount: { type: Number, default: 0 },
  },
  { id: false, versionKey: false },
);

export const Appointment = mongoose.model("Appointment", appointmentSchema);
