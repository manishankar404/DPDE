import crypto from "crypto";
import Patient from "../models/Patient.js";
import { walletRegex } from "../utils/walletQuery.js";

async function generatePatientId() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `P-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const exists = await Patient.exists({ patientId: candidate });
    if (!exists) return candidate;
  }
  throw new Error("Failed to generate a unique patient ID");
}

export async function registerPatient(req, res, next) {
  try {
    const { walletAddress, patientId, name, email, phone } = req.body;

    if (!walletAddress || !name) {
      return res.status(400).json({ message: "walletAddress and name are required" });
    }

    const normalizedWallet = String(walletAddress).toLowerCase();
    const trimmedName = String(name).trim();
    if (!trimmedName) {
      return res.status(400).json({ message: "name is required" });
    }

    const trimmedPatientId = String(patientId || "").trim();
    const resolvedPatientId = trimmedPatientId || (await generatePatientId());

    const existsQuery = trimmedPatientId
      ? { $or: [{ walletAddress: normalizedWallet }, { patientId: resolvedPatientId }] }
      : { walletAddress: normalizedWallet };

    const exists = await Patient.findOne(existsQuery);
    if (exists) {
      return res.status(409).json({ message: "Patient already registered" });
    }

    const patient = await Patient.create({
      walletAddress: normalizedWallet,
      patientId: resolvedPatientId,
      name: trimmedName,
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

export async function getMyNotificationSettings(req, res, next) {
  try {
    const wallet = String(req.user?.walletAddress || "").toLowerCase();
    if (!wallet) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const pattern = walletRegex(wallet);
    const patient = await Patient.findOne({
      $or: [{ walletAddress: wallet }, ...(pattern ? [{ walletAddress: pattern }] : [])]
    }).lean();
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    return res.status(200).json({ enabled: patient.notificationsEnabled !== false });
  } catch (error) {
    return next(error);
  }
}

export async function updateMyNotificationSettings(req, res, next) {
  try {
    const wallet = String(req.user?.walletAddress || "").toLowerCase();
    if (!wallet) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const enabled = req.body?.enabled === undefined ? true : Boolean(req.body?.enabled);
    const pattern = walletRegex(wallet);
    const patient = await Patient.findOneAndUpdate(
      { $or: [{ walletAddress: wallet }, ...(pattern ? [{ walletAddress: pattern }] : [])] },
      { $set: { notificationsEnabled: enabled } },
      { returnDocument: "after" }
    ).lean();

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    return res.status(200).json({ enabled: patient.notificationsEnabled !== false });
  } catch (error) {
    return next(error);
  }
}

export async function searchPatients(req, res, next) {
  try {
    const query = String(req.query.query || req.query.q || "").trim();
    if (!query) {
      return res.status(200).json({ results: [] });
    }

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");

    const results = await Patient.find(
      { $or: [{ name: regex }, { patientId: regex }] },
      { patientId: 1, name: 1 }
    )
      .sort({ name: 1 })
      .limit(15)
      .lean();

    return res.status(200).json({
      results: (results || []).map((patient) => ({
        patientId: patient.patientId,
        name: patient.name
      }))
    });
  } catch (error) {
    return next(error);
  }
}
