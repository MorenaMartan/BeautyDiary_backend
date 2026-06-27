import mongoose from "mongoose";

const diarySchema = new mongoose.Schema(
  {
    date: { type: String, default: "" },
    text: { type: String, default: "" },
    beautician: { type: String, default: "" },
    expanded: { type: Boolean, default: false },
  },
  { _id: false },
);

const clientSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true },
    surname: { type: String, default: "" },
    username: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    email: { type: String, default: "" },
    mobile: { type: String, default: "" },
    birthday: { type: String, default: "" },
    termins: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 },
    wallet: { type: Number, default: 0 },
    spentBeautyPoints: { type: Number, default: 0 },
    diary: { type: [diarySchema], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { id: false, versionKey: false },
);

export const Client = mongoose.model("Client", clientSchema);
