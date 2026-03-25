export const API_BASE_URL = "http://localhost:5000/api";
const AUTH_STORAGE_KEY = "dpde_auth_session";
const UNAUTHORIZED_EVENT = "dpde:unauthorized";

function emitUnauthorized() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
  } catch {
    // ignore
  }
}

function getStoredToken() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed?.token || "";
  } catch {
    return "";
  }
}

export function formatApiError(error, fallbackMessage = "Something went wrong.") {
  if (!error) return fallbackMessage;
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  return fallbackMessage;
}

async function parseResponse(response) {
  const isJson = (response.headers.get("content-type") || "").includes(
    "application/json"
  );
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    if (response.status === 401) {
      emitUnauthorized();
    }
    const message =
      payload?.message || payload?.error || `Request failed with status ${response.status}.`;
    const requestError = new Error(message);
    requestError.status = response.status;
    requestError.payload = payload;
    throw requestError;
  }

  return payload;
}

async function request(path, options = {}) {
  try {
    const token = getStoredToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      },
      ...options
    });
    return await parseResponse(response);
  } catch (error) {
    throw new Error(formatApiError(error));
  }
}

export function registerPatient(data) {
  return request("/patients/register", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function getPatientById(patientId) {
  return request(`/patients/${encodeURIComponent(patientId)}`);
}

export function getMyPatientProfile() {
  return request("/patients/me");
}

export function updateMyPatientProfile(data) {
  return request("/patients/me", {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export function registerProvider(data) {
  return request("/providers/register", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function getProviderByWallet(walletAddress) {
  return request(`/providers/${encodeURIComponent(walletAddress)}`);
}

export function getMyProviderProfile() {
  return request("/providers/me");
}

export function updateMyProviderProfile(data) {
  return request("/providers/me", {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export function updateProviderEncryptionKey(walletAddress, encryptionPublicKey) {
  return request(`/providers/${encodeURIComponent(walletAddress)}/encryption-key`, {
    method: "PUT",
    body: JSON.stringify({ encryptionPublicKey })
  });
}

export function requestNonce(walletAddress) {
  return request("/auth/request-nonce", {
    method: "POST",
    body: JSON.stringify({ walletAddress })
  });
}

export function verifySignature(payload) {
  return request("/auth/verify", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function registerFile(data) {
  return request("/files/register", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function getFilesByPatient(patientId, providerWallet = "") {
  const query = providerWallet
    ? `?providerWallet=${encodeURIComponent(providerWallet)}`
    : "";
  return request(`/files/${encodeURIComponent(patientId)}${query}`, {
    cache: "no-store"
  });
}

export function requestAccess(data) {
  return request("/access/request", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function approveAccess(data) {
  return request("/access/approve", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function rejectAccess(data) {
  return request("/access/reject", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function getPendingRequests(patientId) {
  return request(`/access/pending/${encodeURIComponent(patientId)}`);
}

export function getProviderRequests(providerWallet) {
  return request(`/access/provider/${encodeURIComponent(providerWallet)}`);
}

export function wrapKeyForProvider(data) {
  return request("/files/wrap-key", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function revokeWrappedKeys(data) {
  return request("/files/revoke-key", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function getPatientAuditLogs(walletAddress, options = {}) {
  const query = options?.limit ? `?limit=${encodeURIComponent(options.limit)}` : "";
  return request(`/audit/patient/${encodeURIComponent(walletAddress)}${query}`, {
    cache: "no-store"
  });
}

export function logProviderFileAction(data) {
  return request("/audit/file-action", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function resolveProfiles(wallets = []) {
  return request("/profiles/resolve", {
    method: "POST",
    body: JSON.stringify({ wallets })
  });
}

export function resolveProfile(walletAddress) {
  return request(`/profiles/resolve/${encodeURIComponent(walletAddress)}`);
}
