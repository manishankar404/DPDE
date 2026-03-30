import mongoose from "mongoose";

const patientSchema = new mongoose.Schema(
  {
    walletAddress: { type: String, required: true, unique: true, trim: true },
    patientId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    notificationsEnabled: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

export default mongoose.model("Patient", patientSchema);
