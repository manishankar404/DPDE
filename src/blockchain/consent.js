import { ethers } from "ethers";
import { CONSENT_CONTRACT_ADDRESS } from "./config";

const abi = [
  "event AccessRequested(address indexed patient, address indexed provider)",
  "event AccessGranted(address indexed patient, address indexed provider)",
  "event AccessRevoked(address indexed patient, address indexed provider)",
  "function requestPatientAccess(address patient)",
  "function grantAccess(address provider)",
  "function revokeAccess(address provider)",
  "function rejectAccessRequest(address provider)",
  "function hasAccess(address patient, address provider) view returns (bool)",
  "function getPendingRequests(address patient) view returns (address[])",
  "function getGrantedProviders(address patient) view returns (address[])",
  "function isPending(address patient, address provider) view returns (bool)"
];

let validatedAddress = "";

const SEPOLIA_CHAIN_ID = "0xaa36a7";
const SEPOLIA_PARAMS = {
  chainId: SEPOLIA_CHAIN_ID,
  chainName: "Sepolia",
  rpcUrls: ["https://rpc.sepolia.org"],
  nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
  blockExplorerUrls: ["https://sepolia.etherscan.io"]
};

export async function ensureSepolia() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID }]
    });
  } catch (error) {
    if (error?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [SEPOLIA_PARAMS]
      });
      return;
    }
    throw error;
  }
}

function getProvider() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  return new ethers.BrowserProvider(window.ethereum);
}

async function getSigner() {
  await ensureSepolia();
  const provider = getProvider();
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
}

async function getContract() {
  const signer = await getSigner();
  const contract = new ethers.Contract(CONSENT_CONTRACT_ADDRESS, abi, signer);

  if (validatedAddress !== CONSENT_CONTRACT_ADDRESS) {
    try {
      const self = await contract.runner.getAddress();
      await contract.hasAccess.staticCall(self, self);
      validatedAddress = CONSENT_CONTRACT_ADDRESS;
    } catch (error) {
      try {
        const provider = getProvider();
        const network = await provider.getNetwork();
        console.error("[ConsentManager] Validation failed", {
          address: CONSENT_CONTRACT_ADDRESS,
          chainId: Number(network?.chainId || 0),
          name: network?.name,
          error: error?.message || error
        });
      } catch (logError) {
        console.error("[ConsentManager] Validation failed (logging error)", logError);
      }
      throw new Error(
        "ConsentManager mismatch: update src/blockchain/config.js with the newly deployed patient-level contract address on Sepolia."
      );
    }
  }

  return contract;
}

function getLatestLog(logs) {
  if (!logs || logs.length === 0) return null;
  return logs.reduce((latest, current) => {
    if (!latest) return current;
    const currentIndex = current.index ?? current.logIndex ?? 0;
    const latestIndex = latest.index ?? latest.logIndex ?? 0;
    if (current.blockNumber > latest.blockNumber) return current;
    if (current.blockNumber === latest.blockNumber && currentIndex > latestIndex) {
      return current;
    }
    return latest;
  }, null);
}

function isLogAfter(current, candidate) {
  if (!candidate) return true;
  if (current.blockNumber > candidate.blockNumber) return true;
  if (current.blockNumber < candidate.blockNumber) return false;
  const currentIndex = current.index ?? current.logIndex ?? 0;
  const candidateIndex = candidate.index ?? candidate.logIndex ?? 0;
  return currentIndex > candidateIndex;
}

export async function requestPatientAccess(patientAddress) {
  const contract = await getContract();
  const tx = await contract.requestPatientAccess(patientAddress);
  await tx.wait();
}

export async function grantAccess(providerAddress) {
  const contract = await getContract();
  const tx = await contract.grantAccess(providerAddress);
  await tx.wait();
}

export async function revokeAccess(providerAddress) {
  const contract = await getContract();
  const tx = await contract.revokeAccess(providerAddress);
  await tx.wait();
}

export async function rejectAccessRequest(providerAddress) {
  const contract = await getContract();
  const tx = await contract.rejectAccessRequest(providerAddress);
  await tx.wait();
}

export async function hasAccess(patientAddress, providerAddress) {
  const contract = await getContract();
  return contract.hasAccess(patientAddress, providerAddress);
}

export async function checkMyAccess(patientAddress) {
  const providerAddress = await getCurrentWalletAddress();
  return hasAccess(patientAddress, providerAddress);
}

export async function getPendingRequests(patientAddress) {
  const contract = await getContract();
  return contract.getPendingRequests(patientAddress);
}

export async function isPendingAccessRequest(patientAddress, providerAddress) {
  const contract = await getContract();
  return contract.isPending(patientAddress, providerAddress);
}

export async function getMyPatientAccessStatus(patientAddress) {
  const contract = await getContract();
  const providerAddress = await contract.runner.getAddress();

  const [approved, pending] = await Promise.all([
    contract.hasAccess(patientAddress, providerAddress),
    contract.isPending(patientAddress, providerAddress)
  ]);

  if (approved) return "approved";
  if (pending) return "pending";

  const [requestedLogs, grantedLogs, revokedLogs] = await Promise.all([
    contract.queryFilter(contract.filters.AccessRequested(patientAddress, providerAddress)),
    contract.queryFilter(contract.filters.AccessGranted(patientAddress, providerAddress)),
    contract.queryFilter(contract.filters.AccessRevoked(patientAddress, providerAddress))
  ]);

  const lastRequested = getLatestLog(requestedLogs);
  if (!lastRequested) return "";

  const lastGranted = getLatestLog(grantedLogs);
  const lastRevoked = getLatestLog(revokedLogs);
  const lastDecision = getLatestLog([lastGranted, lastRevoked].filter(Boolean));

  if (!lastDecision) return "denied";
  return lastDecision.fragment.name === "AccessGranted" ? "approved" : "denied";
}

export async function getCurrentWalletAddress() {
  await ensureSepolia();
  const provider = getProvider();
  const accounts = await provider.send("eth_requestAccounts", []);
  return accounts[0];
}

export async function getGrantedProviders(patientAddress) {
  const contract = await getContract();
  try {
    const list = await contract.getGrantedProviders(patientAddress);
    return Array.isArray(list) ? list : [];
  } catch (error) {
    console.warn("[ConsentManager] getGrantedProviders via view failed, falling back to logs", {
      error: error?.message || error
    });
  }

  const [grantedLogs, revokedLogs] = await Promise.all([
    contract.queryFilter(contract.filters.AccessGranted(patientAddress, null)),
    contract.queryFilter(contract.filters.AccessRevoked(patientAddress, null))
  ]);

  const latestByProvider = new Map();
  const applyLog = (log, type) => {
    const provider = log.args?.provider;
    if (!provider) return;
    const existing = latestByProvider.get(provider);
    if (!existing || isLogAfter(log, existing.log)) {
      latestByProvider.set(provider, { type, log });
    }
  };

  grantedLogs.forEach((log) => applyLog(log, "granted"));
  revokedLogs.forEach((log) => applyLog(log, "revoked"));

  return Array.from(latestByProvider.entries())
    .filter(([, value]) => value.type === "granted")
    .map(([provider]) => provider);
}
