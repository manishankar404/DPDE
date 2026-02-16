import mongoose from "mongoose";

const accessRequestSchema = new mongoose.Schema(
  {
    cid: { type: String, required: true, trim: true },
    providerWallet: { type: String, required: true, trim: true },
    patientId: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    createdAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

accessRequestSchema.index(
  { cid: 1, providerWallet: 1, patientId: 1 },
  { unique: true }
);

export default mongoose.model("AccessRequest", accessRequestSchema);
