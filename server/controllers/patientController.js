import Patient from "../models/Patient.js";
import { walletRegex } from "../utils/walletQuery.js";

export async function registerPatient(req, res, next) {
  try {
    const { walletAddress, patientId, name, email, phone } = req.body;

    if (!walletAddress || !patientId || !name) {
      return res.status(400).json({ message: "walletAddress, patientId, and name are required" });
    }

    const normalizedWallet = String(walletAddress).toLowerCase();
    const exists = await Patient.findOne({
      $or: [{ walletAddress: normalizedWallet }, { patientId }]
    });
    if (exists) {
      return res.status(409).json({ message: "Patient already registered" });
    }

    const patient = await Patient.create({
      walletAddress: normalizedWallet,
      patientId,
      name,
      email: email ? String(email).trim() : "",
      phone: phone ? String(phone).trim() : ""
    });
    return res.status(201).json(patient);
  } catch (error) {
    return next(error);
  }
}

export async function getPatientById(req, res, next) {
  try {
    const { patientId } = req.params;
    const patient = await Patient.findOne({ patientId });

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    return res.status(200).json(patient);
  } catch (error) {
    return next(error);
  }
}

export async function getMyPatientProfile(req, res, next) {
  try {
    const wallet = String(req.user?.walletAddress || "").toLowerCase();
    if (!wallet) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const pattern = walletRegex(wallet);
    const patient = await Patient.findOne({
      $or: [{ walletAddress: wallet }, ...(pattern ? [{ walletAddress: pattern }] : [])]
    });
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    return res.status(200).json(patient);
  } catch (error) {
    return next(error);
  }
}

export async function updateMyPatientProfile(req, res, next) {
  try {
    const wallet = String(req.user?.walletAddress || "").toLowerCase();
    if (!wallet) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { name, email, phone } = req.body || {};
    const updates = {};

    if (name !== undefined) {
      const trimmed = String(name || "").trim();
      if (!trimmed) {
        return res.status(400).json({ message: "name is required" });
      }
      updates.name = trimmed;
    }
    if (email !== undefined) {
      updates.email = String(email || "").trim();
    }
    if (phone !== undefined) {
      updates.phone = String(phone || "").trim();
    }
    updates.walletAddress = wallet;

    const pattern = walletRegex(wallet);
    const patient = await Patient.findOneAndUpdate(
      {
        $or: [{ walletAddress: wallet }, ...(pattern ? [{ walletAddress: pattern }] : [])]
      },
      { $set: updates },
      { returnDocument: "after" }
    );

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    return res.status(200).json(patient);
  } catch (error) {
    return next(error);
  }
}
