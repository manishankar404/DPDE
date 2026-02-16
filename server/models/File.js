import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
  {
    cid: { type: String, required: true, trim: true },
    patientId: { type: String, required: true, trim: true },
    fileName: { type: String, required: true, trim: true },
    fileType: { type: String, default: "", trim: true },
    encryptedKey: { type: String, default: "" },
    encryptedIv: { type: String, default: "" },
    encryptedKeyForProvider: { type: String, default: "" },
    encryptedIvForProvider: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

fileSchema.index({ cid: 1, patientId: 1 }, { unique: true });

export default mongoose.model("File", fileSchema);
