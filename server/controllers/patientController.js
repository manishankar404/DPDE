import Patient from "../models/Patient.js";

export async function registerPatient(req, res, next) {
  try {
    const { walletAddress, patientId, name } = req.body;

    if (!walletAddress || !patientId || !name) {
      return res.status(400).json({ message: "walletAddress, patientId, and name are required" });
    }

    const exists = await Patient.findOne({
      $or: [{ walletAddress }, { patientId }]
    });
    if (exists) {
      return res.status(409).json({ message: "Patient already registered" });
    }

    const patient = await Patient.create({ walletAddress, patientId, name });
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
