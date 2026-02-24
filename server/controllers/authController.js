import crypto from "crypto";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import Nonce from "../models/Nonce.js";

export async function requestNonce(req, res, next) {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ message: "walletAddress is required" });
    }

    const nonce = crypto.randomBytes(16).toString("hex");
    await Nonce.findOneAndUpdate(
      { walletAddress },
      { nonce },
      { upsert: true, new: true }
    );

    return res.status(200).json({ nonce });
  } catch (error) {
    return next(error);
  }
}

export async function verifySignature(req, res, next) {
  try {
    const { walletAddress, signature } = req.body;
    if (!walletAddress || !signature) {
      return res.status(400).json({ message: "walletAddress and signature are required" });
    }

    const record = await Nonce.findOne({ walletAddress });
    if (!record) {
      return res.status(400).json({ message: "Nonce not found" });
    }

    const recoveredAddress = ethers.verifyMessage(record.nonce, signature);
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(401).json({ message: "Invalid signature" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET is not configured" });
    }

    const token = jwt.sign({ walletAddress }, process.env.JWT_SECRET, { expiresIn: "1h" });
    await Nonce.deleteOne({ walletAddress });

    return res.status(200).json({ token });
  } catch (error) {
    return next(error);
  }
}
