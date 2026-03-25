import Patient from "../models/Patient.js";
import Provider from "../models/Provider.js";
import { walletRegex } from "./walletQuery.js";

function shortenWallet(wallet = "") {
  const value = String(wallet || "");
  if (!value) return "";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function buildProviderDisplay(provider) {
  const name = provider?.name ? String(provider.name).trim() : "";
  const hospitalName = provider?.hospitalName ? String(provider.hospitalName).trim() : "";
  if (!name) return "";
  return hospitalName ? `${name} (${hospitalName})` : name;
}

export async function resolveWallet(walletAddress) {
  const normalized = String(walletAddress || "").toLowerCase();
  if (!normalized) {
    return { type: "unknown", wallet: "", display: "" };
  }

  const pattern = walletRegex(normalized);
  const patient = await Patient.findOne({
    $or: [{ walletAddress: normalized }, ...(pattern ? [{ walletAddress: pattern }] : [])]
  }).lean();
  if (patient) {
    return {
      type: "patient",
      wallet: normalized,
      name: patient.name || "",
      display: patient.name || shortenWallet(normalized)
    };
  }

  const provider = await Provider.findOne({
    $or: [{ walletAddress: normalized }, ...(pattern ? [{ walletAddress: pattern }] : [])]
  }).lean();
  if (provider) {
    return {
      type: "provider",
      wallet: normalized,
      name: provider.name || "",
      hospitalName: provider.hospitalName || "",
      display: buildProviderDisplay(provider) || shortenWallet(normalized)
    };
  }

  return { type: "unknown", wallet: normalized, display: shortenWallet(normalized) };
}

export async function resolveWallets(walletAddresses = []) {
  const normalizedWallets = Array.from(
    new Set(
      (Array.isArray(walletAddresses) ? walletAddresses : [])
        .map((wallet) => String(wallet || "").toLowerCase())
        .filter(Boolean)
    )
  );

  if (normalizedWallets.length === 0) return {};

  const patterns = normalizedWallets.map(walletRegex).filter(Boolean);
  const [patients, providers] = await Promise.all([
    Patient.find({
      $or: [
        { walletAddress: { $in: normalizedWallets } },
        ...(patterns.length ? [{ walletAddress: { $in: patterns } }] : [])
      ]
    })
      .select({ walletAddress: 1, name: 1 })
      .lean(),
    Provider.find({
      $or: [
        { walletAddress: { $in: normalizedWallets } },
        ...(patterns.length ? [{ walletAddress: { $in: patterns } }] : [])
      ]
    })
      .select({ walletAddress: 1, name: 1, hospitalName: 1 })
      .lean()
  ]);

  const map = {};

  for (const patient of patients || []) {
    const wallet = String(patient.walletAddress || "").toLowerCase();
    if (!wallet) continue;
    map[wallet] = {
      type: "patient",
      wallet,
      name: patient.name || "",
      display: patient.name || shortenWallet(wallet)
    };
  }

  for (const provider of providers || []) {
    const wallet = String(provider.walletAddress || "").toLowerCase();
    if (!wallet) continue;
    map[wallet] = {
      type: "provider",
      wallet,
      name: provider.name || "",
      hospitalName: provider.hospitalName || "",
      display: buildProviderDisplay(provider) || shortenWallet(wallet)
    };
  }

  for (const wallet of normalizedWallets) {
    if (!map[wallet]) {
      map[wallet] = { type: "unknown", wallet, display: shortenWallet(wallet) };
    }
  }

  return map;
}
