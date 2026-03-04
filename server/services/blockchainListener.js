import dotenv from "dotenv";
import { ethers } from "ethers";
import AccessRequest from "../models/AccessRequest.js";

dotenv.config();

const abi = [
  "event AccessRequested(address indexed patient, address indexed provider)",
  "event AccessGranted(address indexed patient, address indexed provider)",
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
    } catch (error) {
      console.error("[listener] AccessRequested error:", error?.message || error);
    }
  });

  contract.on("AccessGranted", async (patient, providerWallet, event) => {
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
        { status: "approved", txHash },
        { upsert: true, returnDocument: "after" }
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
        { status: "rejected", txHash },
        { upsert: true, returnDocument: "after" }
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
        { status: "revoked", txHash },
        { upsert: true, returnDocument: "after" }
      );
    } catch (error) {
      console.error("[listener] AccessRevoked error:", error?.message || error);
    }
  });
}
