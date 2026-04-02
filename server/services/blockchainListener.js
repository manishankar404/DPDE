import process from "node:process";
import dotenv from "dotenv";
import { ethers } from "ethers";
import AccessRequest from "../models/AccessRequest.js";
import Patient from "../models/Patient.js";
import { logAction } from "../utils/auditLogger.js";
import { sendMail } from "../utils/mailer.js";
import { resolveWallet } from "../utils/profileResolver.js";

dotenv.config();

const abi = [
  "event AccessRequested(address indexed patient, address indexed provider)",
  "event AccessGranted(address indexed patient, address indexed provider, uint256 expiry)",
  "event AccessRejected(address indexed patient, address indexed provider)",
  "event AccessRevoked(address indexed patient, address indexed provider)"
];

function getConfig() {
  const rpcUrl = process.env.SEPOLIA_RPC;
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!rpcUrl || !contractAddress) {
    return { rpcUrl: "", contractAddress: "" };
  }
  return { rpcUrl, contractAddress };
}

async function notifyPatientAccessRequested(patientWallet, providerWallet, txHash = "") {
  const normalizedPatientWallet = String(patientWallet || "").toLowerCase();
  const normalizedProviderWallet = String(providerWallet || "").toLowerCase();

  if (!normalizedPatientWallet || !normalizedProviderWallet) return;

  const patient = await Patient.findOne({ walletAddress: normalizedPatientWallet }).lean();
  if (!patient) {
    console.warn("[mail] chain notification skipped (patient not found):", normalizedPatientWallet);
    return;
  }

  const notificationsEnabled = patient.notificationsEnabled !== false;
  if (!notificationsEnabled || !patient.email) {
    console.log("[mail] chain notification skipped:", {
      notificationsEnabled,
      hasEmail: Boolean(patient.email),
      patientId: patient.patientId || "",
      patientWallet: normalizedPatientWallet
    });
    return;
  }

  const providerProfile = await resolveWallet(normalizedProviderWallet);
  const providerDisplay = providerProfile?.display || normalizedProviderWallet;
  const subject = "DPDE: New access request";
  const text = [
    `Hello ${patient.name || "Patient"},`,
    "",
    `${providerDisplay} requested access to your DPDE records.`,
    "",
    `Provider wallet: ${normalizedProviderWallet}`,
    txHash ? `Transaction: ${txHash}` : "",
    "",
    "Log in to DPDE to review and manage access."
  ]
    .filter(Boolean)
    .join("\n");

  console.log("[mail] chain notification attempt:", { to: patient.email, txHash });
  const result = await sendMail({ to: patient.email, subject, text });
  if (!result?.sent) {
    console.warn("[mail] chain notification not sent:", result);
  }
}

export function startBlockchainListener() {
  const { rpcUrl, contractAddress } = getConfig();
  if (!rpcUrl || !contractAddress) {
    console.warn("[listener] Missing SEPOLIA_RPC or CONTRACT_ADDRESS. Listener disabled.");
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, abi, provider);

  console.log("[listener] Blockchain listener started.", { contractAddress });

  (async () => {
    try {
      const [network, blockNumber] = await Promise.all([provider.getNetwork(), provider.getBlockNumber()]);
      console.log("[listener] RPC connected.", {
        chainId: Number(network?.chainId || 0),
        name: network?.name || "",
        blockNumber
      });
    } catch (error) {
      console.error("[listener] RPC connection failed:", error?.message || error);
    }
  })();

  contract.on("AccessRequested", async (patient, providerWallet, event) => {
    try {
      const txHash = event?.log?.transactionHash || "";
      const patientLower = String(patient || "").toLowerCase();
      const providerLower = String(providerWallet || "").toLowerCase();

      console.log("[listener] AccessRequested:", { patient: patientLower, provider: providerLower, txHash });

      if (txHash) {
        const exists = await AccessRequest.findOne({ txHash });
        if (exists) return;
      }

      // Send notification regardless of whether DB logging succeeds.
      notifyPatientAccessRequested(patientLower, providerLower, txHash).catch((error) =>
        console.warn("[mail] chain notification failed:", error?.message || error)
      );

      // Try to resolve patientId for better uniqueness / UI integration.
      const patientRecord = await Patient.findOne({ walletAddress: patientLower })
        .select({ patientId: 1 })
        .lean();
      const patientId = patientRecord?.patientId ? String(patientRecord.patientId) : patientLower;

      try {
        await AccessRequest.create({
          cid: "",
          patientId,
          patientWallet: patientLower,
          providerWallet: providerLower,
          status: "pending",
          txHash
        });
      } catch (dbError) {
        if (dbError?.code === 11000) {
          console.warn("[listener] AccessRequested duplicate DB entry (ignored):", dbError?.message || dbError);
        } else {
          throw dbError;
        }
      }

      logAction({
        action: "REQUEST_ACCESS",
        patientWallet: patient,
        providerWallet,
        cid: "",
        fileName: "",
        role: "provider",
        metadata: { txHash, patientId }
      }).catch((error) =>
        console.warn("[audit] REQUEST_ACCESS (chain) log failed:", error?.message || error)
      );
    } catch (error) {
      console.error("[listener] AccessRequested error:", error?.message || error);
    }
  });

  contract.on("AccessGranted", async (patient, providerWallet, expiry, event) => {
    try {
      const txHash = event?.log?.transactionHash || "";
      if (txHash) {
        const exists = await AccessRequest.findOne({ txHash });
        if (exists) return;
      }
      await AccessRequest.findOneAndUpdate(
        {
          patientWallet: patient.toLowerCase(),
          providerWallet: providerWallet.toLowerCase()
        },
        { status: "approved", expiry: Number(expiry) || 0, txHash },
        { upsert: true, returnDocument: "after" }
      );

      logAction({
        action: "APPROVE",
        patientWallet: patient,
        providerWallet,
        cid: "",
        fileName: "",
        role: "patient",
        metadata: { txHash, expiry: Number(expiry) || 0 }
      }).catch((error) =>
        console.warn("[audit] APPROVE (chain) log failed:", error?.message || error)
      );
    } catch (error) {
      console.error("[listener] AccessGranted error:", error?.message || error);
    }
  });

  contract.on("AccessRejected", async (patient, providerWallet, event) => {
    try {
      const txHash = event?.log?.transactionHash || "";
      if (txHash) {
        const exists = await AccessRequest.findOne({ txHash });
        if (exists) return;
      }
      await AccessRequest.findOneAndUpdate(
        {
          patientWallet: patient.toLowerCase(),
          providerWallet: providerWallet.toLowerCase()
        },
        { status: "rejected", expiry: 0, txHash },
        { upsert: true, returnDocument: "after" }
      );

      logAction({
        action: "REJECT",
        patientWallet: patient,
        providerWallet,
        cid: "",
        fileName: "",
        role: "patient",
        metadata: { txHash }
      }).catch((error) =>
        console.warn("[audit] REJECT (chain) log failed:", error?.message || error)
      );
    } catch (error) {
      console.error("[listener] AccessRejected error:", error?.message || error);
    }
  });

  contract.on("AccessRevoked", async (patient, providerWallet, event) => {
    try {
      const txHash = event?.log?.transactionHash || "";
      if (txHash) {
        const exists = await AccessRequest.findOne({ txHash });
        if (exists) return;
      }
      await AccessRequest.findOneAndUpdate(
        {
          patientWallet: patient.toLowerCase(),
          providerWallet: providerWallet.toLowerCase()
        },
        { status: "revoked", expiry: 0, txHash },
        { upsert: true, returnDocument: "after" }
      );

      logAction({
        action: "REVOKE",
        patientWallet: patient,
        providerWallet,
        cid: "",
        fileName: "",
        role: "patient",
        metadata: { txHash }
      }).catch((error) =>
        console.warn("[audit] REVOKE (chain) log failed:", error?.message || error)
      );
    } catch (error) {
      console.error("[listener] AccessRevoked error:", error?.message || error);
    }
  });
}

