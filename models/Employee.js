import mongoose from "mongoose";

const dayScheduleSchema = new mongoose.Schema(
  {
    start: { type: String, default: "-" },
    end: { type: String, default: "-" },
  },
  { _id: false },
);

const reviewSchema = new mongoose.Schema(
  {
    client: { type: String, required: true },
    rating: { type: Number, required: true },
    comment: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const productOrderSchema = new mongoose.Schema(
  {
    text: { type: String, default: "" },
    checked: { type: Boolean, default: false },
    checkedAt: { type: Date },
  },
  { _id: false },
);

const employeeSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true },
    surname: { type: String, default: "" },
    email: { type: String, default: "" },
    mobile: { type: String, default: "" },
    username: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["Admin", "Beautician"], default: "Beautician" },
    specialties: { type: [String], default: [] },
    schedule: {
      Monday: { type: dayScheduleSchema, default: () => ({}) },
      Tuesday: { type: dayScheduleSchema, default: () => ({}) },
      Wednesday: { type: dayScheduleSchema, default: () => ({}) },
      Thursday: { type: dayScheduleSchema, default: () => ({}) },
      Friday: { type: dayScheduleSchema, default: () => ({}) },
      Saturday: { type: dayScheduleSchema, default: () => ({}) },
      Sunday: { type: dayScheduleSchema, default: () => ({}) },
    },
    reviews: { type: [reviewSchema], default: [] },
    productOrders: { type: [productOrderSchema], default: [] },
    vacations: { type: [String], default: [] },
  },
  { id: false, versionKey: false },
);

export const Employee = mongoose.model("Employee", employeeSchema);
