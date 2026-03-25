import crypto from "crypto";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import Nonce from "../models/Nonce.js";
import Patient from "../models/Patient.js";
import Provider from "../models/Provider.js";
import { walletRegex } from "../utils/walletQuery.js";

export async function requestNonce(req, res, next) {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ message: "walletAddress is required" });
    }

    const normalizedWallet = String(walletAddress).toLowerCase();
    const nonce = crypto.randomBytes(16).toString("hex");
    await Nonce.findOneAndUpdate(
      { walletAddress: normalizedWallet },
      { nonce, walletAddress: normalizedWallet },
      { upsert: true, returnDocument: "after" }
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

    const normalizedWallet = String(walletAddress).toLowerCase();
    const record = await Nonce.findOne({ walletAddress: normalizedWallet });
    if (!record) {
      return res.status(400).json({ message: "Nonce not found" });
    }

    let recoveredAddress = "";
    try {
      recoveredAddress = ethers.verifyMessage(record.nonce, signature);
    } catch {
      return res.status(401).json({ message: "Invalid signature" });
    }
    if (String(recoveredAddress).toLowerCase() !== normalizedWallet) {
      return res.status(401).json({ message: "Invalid signature" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET is not configured" });
    }

    const walletPattern = walletRegex(normalizedWallet);

    let user = await Patient.findOne({
      $or: [{ walletAddress: normalizedWallet }, ...(walletPattern ? [{ walletAddress: walletPattern }] : [])]
    });
    let role = "patient";
    if (!user) {
      user = await Provider.findOne({
        $or: [
          { walletAddress: normalizedWallet },
          ...(walletPattern ? [{ walletAddress: walletPattern }] : [])
        ]
      });
      role = "provider";
    }
    if (!user) {
      return res.status(404).json({ error: "User not registered" });
    }

    const token = jwt.sign(
      { walletAddress: normalizedWallet, role, userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    await Nonce.deleteOne({ walletAddress: normalizedWallet });

    return res.status(200).json({ token, role });
  } catch (error) {
    return next(error);
  }
}
