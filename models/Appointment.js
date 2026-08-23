import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    client_name: { type: String, required: true },
    client_surname: { type: String, default: "" },
    client_email: { type: String, default: "", lowercase: true, trim: true, index: true },
    treatment: { type: String, required: true },
    dayandhour: { type: String, required: true, index: true },
    beautician: { type: String, required: true, index: true },
    beautician_surname: { type: String, default: "" },
    beautician_email: { type: String, default: "", lowercase: true, trim: true, index: true },
    beauticianId: { type: Number, index: true },
    clientId: { type: Number, index: true },
    price: { type: Number, default: 0 },
    originalPrice: { type: Number, default: 0 },
    duration: { type: Number, default: 60 },
    status: { type: String, enum: ["booked", "cancelled", "completed", "no_show"], default: "booked" },
    earningsAmount: { type: Number, default: 0 },
    cancellationFee: { type: Number, default: 0 },
    beautyPointsRedeemed: { type: Number, default: 0, min: 0 },
    discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
  },
  { id: false, versionKey: false },
);

export const Appointment = mongoose.model("Appointment", appointmentSchema);
