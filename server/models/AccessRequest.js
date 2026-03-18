import mongoose from "mongoose";

const accessRequestSchema = new mongoose.Schema(
  {
    cid: { type: String, default: "", trim: true },
    providerWallet: { type: String, required: true, trim: true },
    patientId: { type: String, default: "", trim: true },
    patientWallet: { type: String, default: "", trim: true },
    txHash: { type: String, default: "", trim: true },
    expiry: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "revoked"],
      default: "pending"
    },
    createdAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

accessRequestSchema.index(
  { cid: 1, providerWallet: 1, patientId: 1, patientWallet: 1 },
  { unique: true }
);
accessRequestSchema.index({ txHash: 1 }, { unique: true, sparse: true });

export default mongoose.model("AccessRequest", accessRequestSchema);

