import process from "node:process";
import { ethers } from "ethers";
import AuditLog from "../models/AuditLog.js";
import File from "../models/File.js";
import Patient from "../models/Patient.js";
import { logAction } from "../utils/auditLogger.js";
import { resolveWallets } from "../utils/profileResolver.js";

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

export async function getPatientAuditLogs(req, res, next) {
  try {
    const wallet = (req.params.wallet || "").toLowerCase();
    if (!wallet) {
      return res.status(400).json({ message: "wallet is required" });
    }

    const tokenWallet = (req.user?.walletAddress || "").toLowerCase();
    if (!tokenWallet || tokenWallet !== wallet) {
      return res.status(403).json({ error: "Not authorized to view these logs" });
    }

    const requestedLimit = Number.parseInt(String(req.query.limit || ""), 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 1000)
      : 50;

    const logs = await AuditLog.find({ patientWallet: wallet })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    const providerWallets = Array.from(
      new Set(
        (logs || [])
          .map((log) => String(log.providerWallet || "").toLowerCase())
          .filter(Boolean)
      )
    );
    const profiles = await resolveWallets(providerWallets);

    const enriched = (logs || []).map((log) => {
      const providerWallet = String(log.providerWallet || "").toLowerCase();
      const profile = providerWallet ? profiles[providerWallet] : null;
      const providerName = profile?.type === "provider" ? profile.name || "" : "";
      const providerDisplay = profile?.type === "provider" ? profile.display || "" : "";

      return {
        ...log,
        providerName,
        providerDisplay
      };
    });

    return res.status(200).json(enriched);
  } catch (error) {
    return next(error);
  }
}

export async function logProviderFileAction(req, res, next) {
  try {
    const { action, cid, patientId } = req.body || {};
    const normalizedAction = typeof action === "string" ? action.trim() : "";
    if (!["VIEW_FILE", "DOWNLOAD_FILE", "PRINT_FILE"].includes(normalizedAction)) {
      return res.status(400).json({ message: "action must be VIEW_FILE, DOWNLOAD_FILE, or PRINT_FILE" });
    }
    if (!cid || !patientId) {
      return res.status(400).json({ message: "cid and patientId are required" });
    }

    const providerWallet = (req.user?.walletAddress || "").toLowerCase();
    if (!providerWallet) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const contract = getConsentContract();
    const hasAccess = await contract.hasAccess(patient.walletAddress, providerWallet);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access revoked on blockchain" });
    }

    const file = await File.findOne({ cid, patientId }).lean();
    if (!file) {
      return res.status(404).json({ message: "File not found for patient" });
    }

    let logged = false;
    try {
      await logAction({
        action: normalizedAction,
        patientWallet: patient.walletAddress,
        providerWallet,
        cid,
        fileName: file.fileName || "",
        role: "provider",
        metadata: { patientId }
      });
      logged = true;
    } catch (error) {
      console.warn(`[audit] ${normalizedAction} log failed:`, error?.message || error);
    }

    return res.status(200).json({ logged });
  } catch (error) {
    return next(error);
  }
}

