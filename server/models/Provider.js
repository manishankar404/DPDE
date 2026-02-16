import mongoose from "mongoose";

const providerSchema = new mongoose.Schema(
  {
    walletAddress: { type: String, required: true, unique: true, trim: true },
    hospitalName: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

export default mongoose.model("Provider", providerSchema);
