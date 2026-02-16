import AccessRequest from "../models/AccessRequest.js";
import File from "../models/File.js";
import Patient from "../models/Patient.js";

export async function requestAccess(req, res, next) {
  try {
    const { cid, providerWallet, patientId } = req.body;

    if (!cid || !providerWallet || !patientId) {
      return res.status(400).json({ message: "cid, providerWallet, and patientId are required" });
    }

    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const file = await File.findOne({ cid, patientId });
    if (!file) {
      return res.status(404).json({ message: "File not found for patient" });
    }

    const exists = await AccessRequest.findOne({ cid, providerWallet, patientId });
    if (exists) {
      return res.status(409).json({ message: "Access request already exists" });
    }

    const accessRequest = await AccessRequest.create({
      cid,
      providerWallet,
      patientId,
      status: "pending"
    });

    return res.status(201).json(accessRequest);
  } catch (error) {
    return next(error);
  }
}

export async function approveAccess(req, res, next) {
  try {
    const { cid, providerWallet, patientId } = req.body;

    if (!cid || !providerWallet || !patientId) {
      return res.status(400).json({ message: "cid, providerWallet, and patientId are required" });
    }

    const accessRequest = await AccessRequest.findOneAndUpdate(
      { cid, providerWallet, patientId },
      { status: "approved" },
      { new: true }
    );

    if (!accessRequest) {
      return res.status(404).json({ message: "Access request not found" });
    }

    return res.status(200).json(accessRequest);
  } catch (error) {
    return next(error);
  }
}

export async function rejectAccess(req, res, next) {
  try {
    const { cid, providerWallet, patientId } = req.body;

    if (!cid || !providerWallet || !patientId) {
      return res.status(400).json({ message: "cid, providerWallet, and patientId are required" });
    }

    const accessRequest = await AccessRequest.findOneAndUpdate(
      { cid, providerWallet, patientId },
      { status: "rejected" },
      { new: true }
    );

    if (!accessRequest) {
      return res.status(404).json({ message: "Access request not found" });
    }

    return res.status(200).json(accessRequest);
  } catch (error) {
    return next(error);
  }
}

export async function getPendingByPatientId(req, res, next) {
  try {
    const { patientId } = req.params;
    const requests = await AccessRequest.find({
      patientId,
      status: "pending"
    }).sort({ createdAt: -1 });
    return res.status(200).json(requests);
  } catch (error) {
    return next(error);
  }
}

export async function getByProviderWallet(req, res, next) {
  try {
    const { providerWallet } = req.params;
    const requests = await AccessRequest.find({ providerWallet }).sort({ createdAt: -1 });
    return res.status(200).json(requests);
  } catch (error) {
    return next(error);
  }
}
