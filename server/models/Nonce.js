import mongoose from "mongoose";

const nonceSchema = new mongoose.Schema({
  walletAddress: { type: String, required: true, unique: true },
  nonce: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 300 }
});

export default mongoose.model("Nonce", nonceSchema);
