import { ethers } from "ethers";

// ABI for ConsentManager.sol
const abi = [
  "event AccessGranted(address indexed provider, string cid)",
  "event AccessRevoked(address indexed provider, string cid)",
  "function grantAccess(address provider, string cid)",
  "function revokeAccess(address provider, string cid)",
  "function checkAccess(address provider, string cid) view returns (bool)"
];

// Bytecode placeholder (replace with actual compiled bytecode)
const bytecode = "<CONSENT_MANAGER_BYTECODE>";

// Connect to MetaMask provider
function getProvider() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  return new ethers.BrowserProvider(window.ethereum);
}

// Get signer from MetaMask
async function getSigner() {
  const provider = getProvider();
  await provider.send("eth_requestAccounts", []);
  return await provider.getSigner();
}

// Deploy ConsentManager contract
export async function deployContract() {
  const signer = await getSigner();
  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  return contract.target;
}

// Get contract instance at address
function getContract(address) {
  const provider = getProvider();
  return new ethers.Contract(address, abi, provider).connect(provider);
}

// Grant access
export async function grantAccess(contractAddress, providerAddress, cid) {
  const signer = await getSigner();
  const contract = new ethers.Contract(contractAddress, abi, signer);
  const tx = await contract.grantAccess(providerAddress, cid);
  await tx.wait();
}

// Revoke access
export async function revokeAccess(contractAddress, providerAddress, cid) {
  const signer = await getSigner();
  const contract = new ethers.Contract(contractAddress, abi, signer);
  const tx = await contract.revokeAccess(providerAddress, cid);
  await tx.wait();
}

// Check access
export async function checkAccess(contractAddress, providerAddress, cid) {
  const provider = getProvider();
  const contract = new ethers.Contract(contractAddress, abi, provider);
  return await contract.checkAccess(providerAddress, cid);
}
