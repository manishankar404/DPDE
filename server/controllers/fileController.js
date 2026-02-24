import File from "../models/File.js";
import Patient from "../models/Patient.js";

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
    return res.status(201).json(file);
  } catch (error) {
    return next(error);
  }
}

export async function getFilesByPatientId(req, res, next) {
  try {
    const { patientId } = req.params;
    const providerWallet = (req.query.providerWallet || "").toLowerCase();
    const files = await File.find({ patientId }).sort({ uploadedAt: -1 }).lean();

    if (!providerWallet) {
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

    const normalizedProvider = providerWallet.toLowerCase();
    await File.updateMany(
      { patientId },
      { $pull: { wrappedKeys: { providerWallet: normalizedProvider } } }
    );

    return res.status(200).json({ message: "Wrapped keys revoked." });
  } catch (error) {
    return next(error);
  }
}
