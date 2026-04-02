import { ethers } from "ethers";
import AccessRequest from "../models/AccessRequest.js";
import AuditLog from "../models/AuditLog.js";
import File from "../models/File.js";
import Patient from "../models/Patient.js";
import { logAction } from "../utils/auditLogger.js";

const CONSENT_ABI = [
  "function hasAccess(address patient, address provider) view returns (bool)"
];

function getConsentContract() {
  const rpcUrl = process.env.SEPOLIA_RPC;
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!rpcUrl || !contractAddress) {
    throw new Error("Blockchain RPC or contract address not configured.");
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Contract(contractAddress, CONSENT_ABI, provider);
}

export async function registerFile(req, res, next) {
  try {
    const {
      cid,
      patientId,
      fileName,
      fileType,
      iv,
      encryptedKeyForPatient,
      encryptedKey,
      encryptedIv
    } = req.body;

    if (!cid || !patientId || !fileName) {
      return res.status(400).json({ message: "cid, patientId, and fileName are required" });
    }

    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }
    if (patient.walletAddress.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
      return res.status(403).json({ error: "Not owner of this patientId" });
    }

    const exists = await File.findOne({ cid, patientId });
    if (exists) {
      return res.status(409).json({ message: "File already registered for this patient" });
    }

    const resolvedIv = iv || encryptedIv || "";
    const resolvedEncryptedKeyForPatient = encryptedKeyForPatient || encryptedKey || "";

    if (!resolvedIv || !resolvedEncryptedKeyForPatient) {
      return res.status(400).json({
        message: "iv and encryptedKeyForPatient are required for registration"
      });
    }

    const file = await File.create({
      cid,
      patientId,
      patientWallet: patient.walletAddress,
      fileName,
      fileType,
      iv: resolvedIv,
      encryptedKeyForPatient: resolvedEncryptedKeyForPatient,
      wrappedKeys: [],
      encryptedKey: "",
      encryptedIv: "",
      encryptedKeyForProvider: "",
      encryptedIvForProvider: ""
    });

    logAction({
      action: "UPLOAD",
      patientWallet: patient.walletAddress,
      providerWallet: "",
      cid,
      fileName,
      role: "patient",
      metadata: { patientId, fileType: fileType || "" }
    }).catch((error) => console.warn("[audit] UPLOAD log failed:", error?.message || error));

    return res.status(201).json(file);
  } catch (error) {
    return next(error);
  }
}

export async function getFilesByPatientId(req, res, next) {
  try {
    const { patientId } = req.params;
    let providerWallet = (req.query.providerWallet || "").toLowerCase();
    if (req.user?.role === "patient") {
      const patient = await Patient.findOne({ patientId });
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }
      if (patient.walletAddress.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
        return res.status(403).json({ error: "Not owner of this patientId" });
      }
    }
    const files = await File.find({ patientId }).sort({ uploadedAt: -1 }).lean();

    if (req.user?.role === "provider") {
      const tokenWallet = (req.user.walletAddress || "").toLowerCase();
      if (providerWallet && providerWallet !== tokenWallet) {
        return res.status(403).json({ error: "Provider wallet mismatch" });
      }
      providerWallet = tokenWallet;
      const patient = await Patient.findOne({ patientId });
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }
      const contract = getConsentContract();
      const hasAccess = await contract.hasAccess(patient.walletAddress, providerWallet);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access revoked on blockchain" });
      }
    }

    if (!providerWallet || req.user?.role === "patient") {
      return res.status(200).json(files);
    }

    const mapped = files.map((file) => {
      const wrapped = (file.wrappedKeys || []).find(
        (entry) => (entry.providerWallet || "").toLowerCase() === providerWallet
      );
      return {
        ...file,
        encryptedKeyForProvider: wrapped?.encryptedKey || "",
        encryptedKeyForPatient: "",
        wrappedKeys: []
      };
    });

    return res.status(200).json(mapped);
  } catch (error) {
    return next(error);
  }
}

export async function wrapKeyForProvider(req, res, next) {
  try {
    const { fileId, providerWallet, encryptedKeyForProvider } = req.body;

    if (!fileId || !providerWallet || !encryptedKeyForProvider) {
      return res.status(400).json({
        message: "fileId, providerWallet, and encryptedKeyForProvider are required"
      });
    }

    const normalizedProvider = providerWallet.toLowerCase();
    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }
    const ownerWallet = (file.patientWallet || "").toLowerCase();
    if (!ownerWallet) {
      const patient = await Patient.findOne({ patientId: file.patientId });
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }
      if (patient.walletAddress.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
        return res.status(403).json({ error: "Not owner of this file" });
      }
      // Backfill legacy files that predate patientWallet.
      file.patientWallet = patient.walletAddress;
    } else if (ownerWallet !== req.user.walletAddress.toLowerCase()) {
      return res.status(403).json({ error: "Not owner of this file" });
    }

    const existingIndex = (file.wrappedKeys || []).findIndex(
      (entry) => (entry.providerWallet || "").toLowerCase() === normalizedProvider
    );
    if (existingIndex >= 0) {
      file.wrappedKeys[existingIndex].encryptedKey = encryptedKeyForProvider;
    } else {
      file.wrappedKeys.push({
        providerWallet: normalizedProvider,
        encryptedKey: encryptedKeyForProvider
      });
    }

    await file.save();
    return res.status(200).json({ message: "Wrapped key stored." });
  } catch (error) {
    return next(error);
  }
}

export async function revokeWrappedKeys(req, res, next) {
  try {
    const { patientId, providerWallet } = req.body;
    if (!patientId || !providerWallet) {
      return res.status(400).json({ message: "patientId and providerWallet are required" });
    }

    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }
    if (patient.walletAddress.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
      return res.status(403).json({ error: "Not owner of this patientId" });
    }

    const normalizedProvider = providerWallet.toLowerCase();
    await File.updateMany(
      { patientId },
      { $pull: { wrappedKeys: { providerWallet: normalizedProvider } } }
    );

    logAction({
      action: "REVOKE",
      patientWallet: patient.walletAddress,
      providerWallet: normalizedProvider,
      cid: "",
      fileName: "",
      role: "patient",
      metadata: { patientId }
    }).catch((error) => console.warn("[audit] REVOKE log failed:", error?.message || error));

    return res.status(200).json({ message: "Wrapped keys revoked." });
  } catch (error) {
    return next(error);
  }
}

export async function deleteFileByCid(req, res, next) {
  try {
    const { patientId, cid } = req.params;

    if (!patientId || !cid) {
      return res.status(400).json({ message: "patientId and cid are required" });
    }

    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }
    if (patient.walletAddress.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
      return res.status(403).json({ error: "Not owner of this patientId" });
    }

    const file = await File.findOne({ cid, patientId });
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    const patientWallet = patient.walletAddress.toLowerCase();
    const fileName = String(file.fileName || "");
    const fileType = String(file.fileType || "");

    await Promise.allSettled([
      File.deleteOne({ _id: file._id }),
      AccessRequest.deleteMany({ cid, patientId }),
      AuditLog.deleteMany({ cid, patientWallet })
    ]);

    logAction({
      action: "DELETE_FILE",
      patientWallet,
      providerWallet: "",
      cid,
      fileName,
      role: "patient",
      metadata: { patientId, fileType }
    }).catch((error) =>
      console.warn("[audit] DELETE_FILE log failed:", error?.message || error)
    );

    return res.status(200).json({ deleted: true });
  } catch (error) {
    return next(error);
  }
}
