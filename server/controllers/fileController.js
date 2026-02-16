import File from "../models/File.js";
import Patient from "../models/Patient.js";

export async function registerFile(req, res, next) {
  try {
    const {
      cid,
      patientId,
      fileName,
      fileType,
      encryptedKey,
      encryptedIv,
      encryptedKeyForProvider,
      encryptedIvForProvider
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

    const resolvedEncryptedKey =
      encryptedKeyForProvider || encryptedKey || "";
    const resolvedEncryptedIv =
      encryptedIvForProvider || encryptedIv || "";

    const file = await File.create({
      cid,
      patientId,
      fileName,
      fileType,
      encryptedKey: resolvedEncryptedKey,
      encryptedIv: resolvedEncryptedIv,
      encryptedKeyForProvider: resolvedEncryptedKey,
      encryptedIvForProvider: resolvedEncryptedIv
    });
    return res.status(201).json(file);
  } catch (error) {
    return next(error);
  }
}

export async function getFilesByPatientId(req, res, next) {
  try {
    const { patientId } = req.params;
    const files = await File.find({ patientId }).sort({ uploadedAt: -1 });
    return res.status(200).json(files);
  } catch (error) {
    return next(error);
  }
}
