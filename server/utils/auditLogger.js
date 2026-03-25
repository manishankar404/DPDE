import AuditLog from "../models/AuditLog.js";

export function logAction({
  action,
  patientWallet,
  providerWallet,
  cid,
  fileName,
  role,
  metadata
}) {
  const normalizedAction = typeof action === "string" ? action.trim() : "";
  if (!normalizedAction) {
    return Promise.resolve(null);
  }

  return AuditLog.create({
    action: normalizedAction,
    patientWallet: patientWallet ? String(patientWallet).toLowerCase() : "",
    providerWallet: providerWallet ? String(providerWallet).toLowerCase() : "",
    cid: cid ? String(cid) : "",
    fileName: fileName ? String(fileName) : "",
    role: role ? String(role) : "",
    timestamp: new Date(),
    ...(metadata !== undefined ? { metadata } : {})
  });
}

