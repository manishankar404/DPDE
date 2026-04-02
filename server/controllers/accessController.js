import AccessRequest from "../models/AccessRequest.js";
import File from "../models/File.js";
import Patient from "../models/Patient.js";
import { logAction } from "../utils/auditLogger.js";
import { sendMail } from "../utils/mailer.js";
import { resolveWallet, resolveWallets } from "../utils/profileResolver.js";

async function enrichAccessRequests(requests) {
  const list = Array.isArray(requests) ? requests : [requests].filter(Boolean);
  if (list.length === 0) return requests;

  const wallets = Array.from(
    new Set(
      list
        .map((req) => String(req.providerWallet || "").toLowerCase())
        .filter(Boolean)
    )
  );
  const profiles = await resolveWallets(wallets);

  const enriched = list.map((req) => {
    const wallet = String(req.providerWallet || "").toLowerCase();
    const profile = wallet ? profiles[wallet] : null;
    const providerName = profile?.type === "provider" ? profile.name || "" : "";
    const providerDisplay = profile?.type === "provider" ? profile.display || "" : "";
    return { ...req, providerName, providerDisplay };
  });

  return Array.isArray(requests) ? enriched : enriched[0];
}

export async function requestAccess(req, res, next) {
  try {
    const { cid, providerWallet, patientId } = req.body;

    if (!cid || !providerWallet || !patientId) {
      return res.status(400).json({ message: "cid, providerWallet, and patientId are required" });
    }

    if (providerWallet.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
      return res.status(403).json({ error: "Not owner of this provider wallet" });
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
      providerWallet: String(providerWallet).toLowerCase(),
      patientId,
      status: "pending"
    });

    logAction({
      action: "REQUEST_ACCESS",
      patientWallet: patient.walletAddress,
      providerWallet: req.user.walletAddress,
      cid,
      fileName: file.fileName || "",
      role: "provider",
      metadata: { patientId }
    }).catch((error) => console.warn("[audit] REQUEST_ACCESS log failed:", error?.message || error));

    const notificationsEnabled = patient.notificationsEnabled !== false;
    if (!notificationsEnabled || !patient.email) {
      console.log("[mail] notification skipped:", {
        notificationsEnabled,
        hasEmail: Boolean(patient.email),
        patientId
      });
    }

    if (notificationsEnabled && patient.email) {
      console.log("[mail] notification attempt:", { to: patient.email, patientId });
      (async () => {
        const providerProfile = await resolveWallet(providerWallet);
        const providerDisplay = providerProfile?.display || providerWallet;
        const fileName = file.fileName || "a file";
        const subject = `DPDE: New access request for ${fileName}`;
        const text = [
          `Hello ${patient.name || "Patient"},`,
          "",
          `${providerDisplay} requested access to "${fileName}".`,
          `Patient ID: ${patientId}`,
          `File CID: ${cid}`,
          "",
          "Log in to DPDE to approve or reject this request."
        ].join("\n");

        const result = await sendMail({ to: patient.email, subject, text });
        if (!result?.sent) {
          console.warn("[mail] access request notification not sent:", result);
        } else if (
          String(process.env.MAIL_DEBUG || "").toLowerCase() === "true" ||
          String(process.env.MAIL_DEBUG || "") === "1"
        ) {
          console.log("[mail] access request notification sent:", {
            to: patient.email,
            messageId: result?.messageId || ""
          });
        }
      })().catch((error) => {
        console.warn("[mail] access request notification failed:", error?.message || error);
      });
    }

    const enriched = await enrichAccessRequests(
      accessRequest?.toObject ? accessRequest.toObject() : accessRequest
    );
    return res.status(201).json(enriched);
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

    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }
    if (patient.walletAddress.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
      return res.status(403).json({ error: "Not owner of this patientId" });
    }

    const normalizedProviderWallet = String(providerWallet).toLowerCase();
    const accessRequest = await AccessRequest.findOneAndUpdate(
      { cid, providerWallet: normalizedProviderWallet, patientId },
      { status: "approved" },
      { new: true }
    );

    if (!accessRequest) {
      return res.status(404).json({ message: "Access request not found" });
    }

    File.findOne({ cid, patientId })
      .lean()
      .then((file) => file?.fileName || "")
      .catch(() => "")
      .then((resolvedFileName) =>
        logAction({
          action: "APPROVE",
          patientWallet: patient.walletAddress,
          providerWallet,
          cid,
          fileName: resolvedFileName,
          role: "patient",
          metadata: { patientId }
        })
      )
      .catch((error) => console.warn("[audit] APPROVE log failed:", error?.message || error));

    const enriched = await enrichAccessRequests(
      accessRequest?.toObject ? accessRequest.toObject() : accessRequest
    );
    return res.status(200).json(enriched);
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

    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }
    if (patient.walletAddress.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
      return res.status(403).json({ error: "Not owner of this patientId" });
    }

    const normalizedProviderWallet = String(providerWallet).toLowerCase();
    const accessRequest = await AccessRequest.findOneAndUpdate(
      { cid, providerWallet: normalizedProviderWallet, patientId },
      { status: "rejected" },
      { new: true }
    );

    if (!accessRequest) {
      return res.status(404).json({ message: "Access request not found" });
    }

    File.findOne({ cid, patientId })
      .lean()
      .then((file) => file?.fileName || "")
      .catch(() => "")
      .then((resolvedFileName) =>
        logAction({
          action: "REJECT",
          patientWallet: patient.walletAddress,
          providerWallet,
          cid,
          fileName: resolvedFileName,
          role: "patient",
          metadata: { patientId }
        })
      )
      .catch((error) => console.warn("[audit] REJECT log failed:", error?.message || error));

    const enriched = await enrichAccessRequests(
      accessRequest?.toObject ? accessRequest.toObject() : accessRequest
    );
    return res.status(200).json(enriched);
  } catch (error) {
    return next(error);
  }
}

export async function getPendingByPatientId(req, res, next) {
  try {
    const { patientId } = req.params;
    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }
    if (patient.walletAddress.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
      return res.status(403).json({ error: "Not owner of this patientId" });
    }
    const requests = await AccessRequest.find({
      patientId,
      status: "pending"
    }).sort({ createdAt: -1 });
    const enriched = await enrichAccessRequests(requests.map((item) => item.toObject()));
    return res.status(200).json(enriched);
  } catch (error) {
    return next(error);
  }
}

export async function getByProviderWallet(req, res, next) {
  try {
    const { providerWallet } = req.params;
    if (providerWallet.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
      return res.status(403).json({ error: "Not owner of this provider wallet" });
    }
    const normalizedProviderWallet = String(providerWallet).toLowerCase();
    const requests = await AccessRequest.find({ providerWallet: normalizedProviderWallet }).sort({
      createdAt: -1
    });
    const enriched = await enrichAccessRequests(requests.map((item) => item.toObject()));
    return res.status(200).json(enriched);
  } catch (error) {
    return next(error);
  }
}
