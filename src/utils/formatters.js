export function shortenWallet(wallet = "") {
  const value = String(wallet || "");
  if (!value) return "";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function formatProvider(provider = {}) {
  const providerName = String(provider.providerName || provider.name || "").trim();
  const providerDisplay = String(provider.providerDisplay || "").trim();
  const providerWallet = String(provider.providerWallet || provider.walletAddress || provider.wallet || "").trim();

  if (providerDisplay) return providerDisplay;
  if (providerName) return providerName;
  return providerWallet ? shortenWallet(providerWallet) : "Unknown";
}

export function formatActionLog(log = {}) {
  const action = String(log.action || "").trim();
  const role = String(log.role || "").trim();
  const providerDisplay =
    String(log.providerDisplay || "").trim() ||
    String(log.providerName || "").trim() ||
    (log.providerWallet ? shortenWallet(log.providerWallet) : "");
  const fileName = String(log.fileName || "").trim();

  const actor = providerDisplay || "A provider";

  switch (action) {
    case "UPLOAD":
      return fileName ? `You uploaded ${fileName}` : "You uploaded a file";
    case "REQUEST_ACCESS":
      return `${actor} requested access`;
    case "APPROVE":
      return `Access granted to ${actor}`;
    case "REJECT":
      return `Access rejected for ${actor}`;
    case "REVOKE":
      return `Access revoked for ${actor}`;
    case "VIEW_FILE":
      if (role === "patient") {
        return fileName ? `You viewed ${fileName}` : "You viewed a file";
      }
      return fileName ? `${actor} viewed ${fileName}` : `${actor} viewed a file`;
    case "DOWNLOAD_FILE":
      if (role === "patient") {
        return fileName ? `You downloaded ${fileName}` : "You downloaded a file";
      }
      return fileName ? `${actor} downloaded ${fileName}` : `${actor} downloaded a file`;
    case "PRINT_FILE":
      if (role === "patient") {
        return fileName ? `You printed ${fileName}` : "You printed a file";
      }
      return fileName ? `${actor} printed ${fileName}` : `${actor} printed a file`;
    case "DELETE_FILE":
      return fileName ? `You deleted ${fileName}` : "You deleted a file";
    default:
      return action ? `${action} ${fileName ? `• ${fileName}` : ""}`.trim() : "Activity";
  }
}
