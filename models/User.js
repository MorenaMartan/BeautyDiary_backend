import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    sourceId: { type: Number, required: true },
    sourceType: { type: String, enum: ["employee", "client"], required: true },
    name: { type: String, required: true },
    surname: { type: String, default: "" },
    username: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["Admin", "Beautician", "Client"], required: true },
    email: { type: String, default: "" },
    mobile: { type: String, default: "" },
  },
  { versionKey: false },
);

userSchema.index({ sourceId: 1, sourceType: 1 }, { unique: true });

export const User = mongoose.model("User", userSchema);
