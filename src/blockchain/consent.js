import { ethers } from "ethers";

// ✅ DEPLOYED ConsentManager CONTRACT ADDRESS (Sepolia)
const CONTRACT_ADDRESS = "0x7645f28e8EC6441F6FE5ad7475f09e3B96e272Ea";

// ABI for ConsentManager.sol
const abi = [
  "event AccessGranted(address indexed provider, string cid)",
  "event AccessRevoked(address indexed provider, string cid)",
  "function grantAccess(address provider, string cid)",
  "function revokeAccess(address provider, string cid)",
  "function checkAccess(address provider, string cid) view returns (bool)"
];

// MetaMask provider
function getProvider() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  return new ethers.BrowserProvider(window.ethereum);
}

// MetaMask signer
async function getSigner() {
  const provider = getProvider();
  await provider.send("eth_requestAccounts", []);
  return await provider.getSigner();
}

// ---------------- CONTRACT ACTIONS ----------------

// Grant access (writes to blockchain)
export async function grantAccess(providerAddress, cid) {
  const signer = await getSigner();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);

  const tx = await contract.grantAccess(providerAddress, cid);
  await tx.wait();
}

// Revoke access (writes to blockchain)
export async function revokeAccess(providerAddress, cid) {
  const signer = await getSigner();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);

  const tx = await contract.revokeAccess(providerAddress, cid);
  await tx.wait();
}

// Check access (read-only)
export async function checkAccess(providerAddress, cid) {
  const provider = getProvider();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

  return await contract.checkAccess(providerAddress, cid);
}

// Get connected wallet
export async function getCurrentWalletAddress() {
  if (!window.ethereum) throw new Error("MetaMask not found");

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });

  return accounts[0];
}
