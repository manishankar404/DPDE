export const API_BASE_URL = "http://localhost:5000/api";

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
    const message =
      payload?.message || `Request failed with status ${response.status}.`;
    const requestError = new Error(message);
    requestError.status = response.status;
    requestError.payload = payload;
    throw requestError;
  }

  return payload;
}

async function request(path, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
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

export function registerProvider(data) {
  return request("/providers/register", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function getProviderByWallet(walletAddress) {
  return request(`/providers/${encodeURIComponent(walletAddress)}`);
}

export function registerFile(data) {
  return request("/files/register", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function getFilesByPatient(patientId) {
  return request(`/files/${encodeURIComponent(patientId)}`);
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

