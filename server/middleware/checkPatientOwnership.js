import Patient from "../models/Patient.js";

export async function checkPatientOwnership(req, res, next) {
  try {
    const patientId = req.params.patientId || req.body.patientId;
    if (!patientId) {
      return res.status(400).json({ error: "patientId is required" });
    }

    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    if (patient.walletAddress.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
      return res.status(403).json({ error: "Not owner of this patientId" });
    }

    req.patient = patient;
    return next();
  } catch (error) {
    return next(error);
  }
}
