export function walletRegex(walletAddress) {
  const normalized = String(walletAddress || "").toLowerCase();
  if (!normalized) return null;
  // Wallet is hex-only, but escape anyway for safety.
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
}

