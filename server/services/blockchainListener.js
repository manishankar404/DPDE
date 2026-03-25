import process from "node:process";
import dotenv from "dotenv";
import { ethers } from "ethers";
import AccessRequest from "../models/AccessRequest.js";
import { logAction } from "../utils/auditLogger.js";

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

export function startBlockchainListener() {
  const { rpcUrl, contractAddress } = getConfig();
  if (!rpcUrl || !contractAddress) {
    console.warn("[listener] Missing SEPOLIA_RPC or CONTRACT_ADDRESS. Listener disabled.");
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, abi, provider);

  console.log("[listener] Blockchain listener started.");

  contract.on("AccessRequested", async (patient, providerWallet, event) => {
    try {
      const txHash = event?.log?.transactionHash || "";
      if (txHash) {
        const exists = await AccessRequest.findOne({ txHash });
        if (exists) return;
      }
      await AccessRequest.create({
        patientWallet: patient.toLowerCase(),
        providerWallet: providerWallet.toLowerCase(),
        status: "pending",
        txHash
      });

      logAction({
        action: "REQUEST_ACCESS",
        patientWallet: patient,
        providerWallet,
        cid: "",
        fileName: "",
        role: "provider",
        metadata: { txHash }
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

