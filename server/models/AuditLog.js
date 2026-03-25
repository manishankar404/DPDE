import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true },
    patientWallet: { type: String, default: "", trim: true },
    providerWallet: { type: String, default: "", trim: true },
    cid: { type: String, default: "", trim: true },
    fileName: { type: String, default: "", trim: true },
    role: { type: String, default: "", trim: true },
    timestamp: { type: Date, default: Date.now },
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  { versionKey: false }
);

auditLogSchema.index({ patientWallet: 1, timestamp: -1 });

export default mongoose.model("AuditLog", auditLogSchema);

