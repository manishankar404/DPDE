import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatApiError,
  getFilesByPatient,
  getMyProviderProfile,
  getPatientById,
  logProviderFileAction,
  searchPatients,
  updateMyProviderProfile
} from "../api";
import { getCurrentWalletAddress, hasAccess, requestPatientAccess, getAccessExpiry } from "../blockchain/consent";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import Input from "../components/Input";
import Loader from "../components/Loader";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import Toast from "../components/Toast";
import DicomViewer from "../components/DicomViewer";
import NiftiViewer from "../components/NiftiViewer";
import { useAccess } from "../context/AccessContext";
import { useAuth } from "../context/AuthContext";
import { decryptBlob } from "../decrypt";

function decodeArray(encoded) {
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(atob(encoded));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function base64ToBytes(value) {
  if (!value) return [];
  const binary = atob(value);
  return Array.from(binary).map((char) => char.charCodeAt(0));
}

async function decryptKeyWithWallet(encryptedKeyHex, walletAddress) {
  return window.ethereum.request({
    method: "eth_decrypt",
    params: [encryptedKeyHex, walletAddress]
  });
}

function getEncryptedMaterial(file) {
  const keyCandidate =
    file.encryptedKeyForProvider ||
    file.encryptedKey ||
    file.keyCipher ||
    file.key ||
    "";
  const ivCandidate =
    file.encryptedIvForProvider ||
    file.encryptedIv ||
    file.ivCipher ||
    file.iv ||
    "";
  return { keyCandidate, ivCandidate };
}

function isWrappedKey(value) {
  return typeof value === "string" && value.startsWith("0x");
}

const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://w3s.link/ipfs/"
];
let lastHealthyGateway = IPFS_GATEWAYS[0];

async function fetchIpfsWithFallback(cid) {
  let lastError = null;
  const orderedGateways = [
    lastHealthyGateway,
    ...IPFS_GATEWAYS.filter((gateway) => gateway !== lastHealthyGateway)
  ];

  for (const gateway of orderedGateways) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${gateway}${cid}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        lastHealthyGateway = gateway;
        return response;
      }
      lastError = new Error(`Gateway failed: ${gateway} (${response.status})`);
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
    }
  }

  throw lastError || new Error("Failed to fetch file from IPFS gateways.");
}

export default function ProviderDashboard() {
  const { user, updateUser } = useAuth();
  const { patientAccessStatus, refreshAccessStatus } = useAccess();
  const [patientId, setPatientId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientSearchQuery, setPatientSearchQuery] = useState("");
  const [patientMatches, setPatientMatches] = useState([]);
  const [loadingPatientMatches, setLoadingPatientMatches] = useState(false);
  const [patientIdError, setPatientIdError] = useState("");
  const [patientAddress, setPatientAddress] = useState("");
  const [files, setFiles] = useState([]);
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockStats, setUnlockStats] = useState({ total: 0, cached: 0 });
  const [accessExpiry, setAccessExpiry] = useState(0);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    hospitalName: "",
    specialization: "",
    email: ""
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [preview, setPreview] = useState({
    open: false,
    url: "",
    type: "",
    name: "",
    isDicom: false,
    isNifti: false
  });
  const [toasts, setToasts] = useState([]);
  const objectUrlsRef = useRef([]);
  const keyCacheRef = useRef(new Map());

  function addToast(message, tone = "info") {
    setToasts((prev) => [...prev, { id: `${Date.now()}_${Math.random()}`, message, tone }]);
  }

  function removeToast(id) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  const filteredFiles = useMemo(() => {
    if (!Array.isArray(files)) return [];
    const needle = String(fileSearchQuery || "").trim().toLowerCase();
    if (!needle) return files;
    return files.filter((file) => {
      const fileName = String(file?.fileName || "").toLowerCase();
      const cid = String(file?.cid || "").toLowerCase();
      const fileType = String(file?.fileType || "").toLowerCase();
      return `${fileName} ${cid} ${fileType}`.includes(needle);
    });
  }, [fileSearchQuery, files]);

  useEffect(() => {
    let active = true;
    const query = String(patientSearchQuery || "").trim();
    if (query.length < 2) {
      setPatientMatches([]);
      setLoadingPatientMatches(false);
      return undefined;
    }

    setLoadingPatientMatches(true);
    const timer = setTimeout(() => {
      searchPatients(query)
        .then((response) => {
          if (!active) return;
          const results = Array.isArray(response?.results) ? response.results : [];
          setPatientMatches(results);
          setPatientIdError("");
        })
        .catch((error) => {
          if (!active) return;
          setPatientMatches([]);
          setPatientIdError(formatApiError(error, "Unable to search patients."));
        })
        .finally(() => {
          if (!active) return;
          setLoadingPatientMatches(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [patientSearchQuery]);

  function openProfileEditor() {
    setProfileForm({
      name: user?.name || "",
      hospitalName: user?.hospitalName || "",
      specialization: user?.specialization || "",
      email: user?.email || ""
    });
    setProfileModalOpen(true);
  }

  async function saveProfile() {
    if (!profileForm.name.trim()) {
      addToast("Name is required.", "error");
      return;
    }
    setSavingProfile(true);
    try {
      const updated = await updateMyProviderProfile({
        name: profileForm.name.trim(),
        hospitalName: profileForm.hospitalName.trim(),
        specialization: profileForm.specialization.trim(),
        email: profileForm.email.trim()
      });
      updateUser({
        name: updated?.name || profileForm.name.trim(),
        hospitalName: updated?.hospitalName || profileForm.hospitalName.trim(),
        specialization: updated?.specialization || profileForm.specialization.trim(),
        email: updated?.email || profileForm.email.trim()
      });
      addToast("Profile updated.", "success");
      setProfileModalOpen(false);
    } catch (error) {
      addToast(formatApiError(error, "Failed to update profile."), "error");
    } finally {
      setSavingProfile(false);
    }
  }

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadMyProfile() {
      if (!user?.walletAddress) return;
      try {
        const profile = await getMyProviderProfile();
        if (!active || !profile) return;
        updateUser({
          name: profile.name,
          hospitalName: profile.hospitalName,
          specialization: profile.specialization,
          email: profile.email,
          walletAddress: profile.walletAddress
        });
      } catch {
        // Ignore profile fetch failures; dashboard can still run from cached session.
      }
    }

    loadMyProfile();
    return () => {
      active = false;
    };
  }, [user?.walletAddress, updateUser]);

  useEffect(() => {
    keyCacheRef.current.clear();
    setUnlockStats({ total: 0, cached: 0 });
    setAccessExpiry(0);
  }, [patientAddress]);

  useEffect(() => {
    let active = true;

    async function loadExpiry() {
      if (!patientAddress || patientAccessStatus !== "approved") {
        if (active) setAccessExpiry(0);
        return;
      }
      try {
        const providerAddress = user?.walletAddress || (await getCurrentWalletAddress());
        const expiry = await getAccessExpiry(patientAddress, providerAddress);
        if (active) setAccessExpiry(Number(expiry) || 0);
      } catch {
        if (active) setAccessExpiry(0);
      }
    }

    loadExpiry();
    return () => {
      active = false;
    };
  }, [patientAddress, patientAccessStatus, user?.walletAddress]);

  function closePreview() {
    if (preview.url) {
      URL.revokeObjectURL(preview.url);
      objectUrlsRef.current = objectUrlsRef.current.filter((item) => item !== preview.url);
    }
    setPreview({ open: false, url: "", type: "", name: "", isDicom: false, isNifti: false });
  }

  const accessBadge = useMemo(() => {
    if (patientAccessStatus === "approved") return "Access Granted";
    if (patientAccessStatus === "pending") return "Access Requested - Waiting for Approval";
    if (patientAccessStatus === "denied") return "Access Denied";
    return "Not Requested";
  }, [patientAccessStatus]);

  async function searchPatientFiles(patientIdOverride = "") {
    const raw = patientIdOverride || patientSearchQuery || patientId;
    const query = String(raw || "").trim();
    if (!query) {
      setPatientIdError("Patient ID or patient name is required.");
      return;
    }

    setPatientIdError("");
    setLoadingSearch(true);
    try {
      let trimmedId = query;
      const looksLikePatientId = /^P-[A-Z0-9-]+$/i.test(trimmedId);
      if (!looksLikePatientId) {
        const response = await searchPatients(trimmedId);
        const results = Array.isArray(response?.results) ? response.results : [];
        if (results.length === 1) {
          trimmedId = results[0].patientId;
        } else if (results.length > 1) {
          setPatientMatches(results);
          setPatientIdError("Select a patient from the list.");
          return;
        } else {
          setPatientIdError("No matching patients found.");
          return;
        }
      }

      setPatientId(trimmedId);
      setPatientSearchQuery(trimmedId);
      const providerWallet = user?.walletAddress || (await getCurrentWalletAddress());

      // Fetch patient first so the access UI renders even if file listing is forbidden.
      const patient = await getPatientById(trimmedId);
      setPatientAddress(patient.walletAddress);
      setPatientName(patient.name || "");

      const status = await refreshAccessStatus(patient.walletAddress);
      if (!status) {
        console.error("[ProviderDashboard] Access status unavailable", {
          patientId: trimmedId,
          patientAddress: patient.walletAddress
        });
        addToast(
          "Patient files loaded, but blockchain access status is unavailable. Redeploy/update ConsentManager if needed.",
          "warning"
        );
      }

      // Only fetch encrypted file metadata after blockchain approval.
      // Otherwise the backend will 403 (source-of-truth enforcement).
      if (status !== "approved") {
        setFiles([]);
        setFileSearchQuery("");
        return;
      }

      const fileList = await getFilesByPatient(trimmedId, providerWallet);
      setFiles(Array.isArray(fileList) ? fileList : []);
      setFileSearchQuery("");
    } catch (error) {
      setFiles([]);
      setPatientAddress("");
      setPatientName("");
      const message = formatApiError(error, "Failed to search patient records.");
      setPatientIdError(message);
      addToast(message, "error");
    } finally {
      setLoadingSearch(false);
    }
  }

  function selectPatient(match) {
    if (!match?.patientId) return;
    setPatientMatches([]);
    setPatientIdError("");
    setPatientSearchQuery(match.patientId);
    searchPatientFiles(match.patientId).catch(() => {});
  }

  async function requestFullAccess() {
    if (!patientAddress) return;
    setActionLoading("request");
    try {
      await requestPatientAccess(patientAddress);
      await refreshAccessStatus(patientAddress);
      addToast("Full access request submitted.", "success");
    } catch (error) {
      addToast(formatApiError(error, "Failed to request access."), "error");
    } finally {
      setActionLoading("");
    }
  }

  async function ensureBlockchainAccess(patientWallet, providerWallet) {
    const allowed = await hasAccess(patientWallet, providerWallet);
    if (!allowed) {
      await refreshAccessStatus(patientWallet);
      throw new Error("Access revoked by patient.");
    }
  }

  async function getDecryptionMaterials(file, providerAddress) {
    let key = [];
    let iv = [];
    let cacheKey = "";

    if (file.encryptedKeyForProvider && file.iv) {
      cacheKey = file.cid || file._id || "";
      if (cacheKey && keyCacheRef.current.has(cacheKey)) {
        const cached = keyCacheRef.current.get(cacheKey);
        return { key: cached.key, iv: cached.iv };
      }

      if (!window.ethereum) {
        throw new Error("MetaMask not found.");
      }
      const aesKeyBase64 = await decryptKeyWithWallet(
        file.encryptedKeyForProvider,
        providerAddress
      );
      key = base64ToBytes(aesKeyBase64);
      iv = base64ToBytes(file.iv);
      if (cacheKey && key.length && iv.length) {
        keyCacheRef.current.set(cacheKey, { key, iv });
      }
      return { key, iv };
    }

    const { keyCandidate, ivCandidate } = getEncryptedMaterial(file);
    if (isWrappedKey(keyCandidate) && !file.iv) {
      const fallback = getEncryptedMaterial({
        ...file,
        encryptedKeyForProvider: "",
        encryptedIvForProvider: ""
      });
      key = decodeArray(fallback.keyCandidate);
      iv = decodeArray(fallback.ivCandidate);
    } else {
      key = decodeArray(keyCandidate);
      iv = decodeArray(ivCandidate);
    }
    return { key, iv };
  }

  async function decryptToObjectUrl(file) {
    if (!patientAddress) return;

    try {
      const providerAddress = await getCurrentWalletAddress();
      await ensureBlockchainAccess(patientAddress, providerAddress);

      const { key, iv } = await getDecryptionMaterials(file, providerAddress);
      if (!key.length || !iv.length) {
        throw new Error("Missing encrypted key material for file.");
      }

      const response = await fetchIpfsWithFallback(file.cid);
      const encryptedBlob = await response.blob();
      const decryptedBlob = await decryptBlob(encryptedBlob, key, iv);

      const mimeType = file.fileType || decryptedBlob.type || "application/octet-stream";
      const normalizedBlob = new Blob([decryptedBlob], { type: mimeType });
      const url = URL.createObjectURL(normalizedBlob);
      objectUrlsRef.current.push(url);
      return { url, mimeType, providerAddress };
    } catch (error) {
      throw error;
    }
  }

  async function printFile(file) {
    if (!patientAddress) return;
    setActionLoading(`print_${file.cid}`);
    let frame = null;

    try {
      const { url, providerAddress } = await decryptToObjectUrl(file);
      frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      frame.onload = () => {
        try {
          const frameWindow = frame.contentWindow;
          frameWindow?.focus();
          frameWindow?.print();
        } catch {
          // ignore
        }
        setTimeout(() => frame?.remove(), 1000);
      };
      frame.src = url;
      document.body.appendChild(frame);

      addToast(`Print dialog opened as ${providerAddress.slice(0, 6)}...`, "success");
      if (patientId && file?.cid) {
        logProviderFileAction({ action: "PRINT_FILE", cid: file.cid, patientId }).catch(() => {});
      }
    } catch (error) {
      frame?.remove();
      addToast(formatApiError(error, "Failed to print file."), "error");
    } finally {
      setActionLoading("");
    }
  }
  async function viewFile(file) {
    if (!patientAddress) return;
    setActionLoading(`view_${file.cid}`);
    try {
      const { url, mimeType } = await decryptToObjectUrl(file);
      const loweredName = (file.fileName || "").toLowerCase();
      const isDicom =
        (file.fileType || "").toLowerCase().includes("dicom") ||
        loweredName.endsWith(".dcm");
      const isNifti =
        loweredName.endsWith(".nii") ||
        loweredName.endsWith(".nii.gz") ||
        loweredName.endsWith(".nia");
      setPreview({
        open: true,
        url,
        type: mimeType,
        name: file.fileName || "record",
        isDicom,
        isNifti
      });
      addToast("File opened in web preview.", "success");
      if (patientId && file?.cid) {
        logProviderFileAction({ action: "VIEW_FILE", cid: file.cid, patientId }).catch(() => {});
      }
    } catch (error) {
      addToast(formatApiError(error, "Failed to preview file."), "error");
    } finally {
      setActionLoading("");
    }
  }

  async function unlockSessionKeys() {
    if (!patientAddress) return;
    setUnlockLoading(true);
    try {
      const providerAddress = await getCurrentWalletAddress();
      await ensureBlockchainAccess(patientAddress, providerAddress);

      const filesNeedingKeys = files.filter(
        (file) => file.encryptedKeyForProvider && file.iv
      );
      let cached = 0;

      for (const file of filesNeedingKeys) {
        const cacheKey = file.cid || file._id || "";
        if (cacheKey && keyCacheRef.current.has(cacheKey)) {
          cached += 1;
          continue;
        }
        try {
          const { key, iv } = await getDecryptionMaterials(file, providerAddress);
          if (cacheKey && key.length && iv.length) {
            keyCacheRef.current.set(cacheKey, { key, iv });
            cached += 1;
          }
        } catch {
          // ignore individual failures
        }
      }

      setUnlockStats({ total: filesNeedingKeys.length, cached });
      addToast("Session keys cached for this patient.", "success");
    } catch (error) {
      addToast(formatApiError(error, "Failed to unlock session."), "error");
    } finally {
      setUnlockLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card title="Welcome">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-slate-500">Doctor</div>
            <div className="text-sm font-semibold text-slate-900">{user?.name || "Doctor"}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Hospital</div>
            <div className="text-sm text-slate-700">{user?.hospitalName || "—"}</div>
          </div>
        </div>
      </Card>

      <Modal
        open={profileModalOpen}
        title="Edit Profile"
        onClose={() => setProfileModalOpen(false)}
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            saveProfile();
          }}
        >
          <Input
            id="providerProfileName"
            label="Doctor Name"
            value={profileForm.name}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <Input
            id="providerProfileHospital"
            label="Hospital Name (optional)"
            value={profileForm.hospitalName}
            onChange={(event) =>
              setProfileForm((prev) => ({ ...prev, hospitalName: event.target.value }))
            }
          />
          <Input
            id="providerProfileSpecialization"
            label="Specialization (optional)"
            value={profileForm.specialization}
            onChange={(event) =>
              setProfileForm((prev) => ({ ...prev, specialization: event.target.value }))
            }
          />
          <Input
            id="providerProfileEmail"
            label="Email (optional)"
            value={profileForm.email}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
          />

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              disabled={savingProfile}
              onClick={() => setProfileModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={savingProfile}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      <Card title="Search Patient Records" subtitle="Search by patient ID or patient name">
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            searchPatientFiles();
          }}
        >
          <Input
            id="providerPatientId"
            label="Patient ID or Name"
            value={patientSearchQuery}
            onChange={(event) => setPatientSearchQuery(event.target.value)}
            error={patientIdError}
          />
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Press Enter to search.
          </div>
        </form>
        {loadingPatientMatches ? (
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Searching patients…</div>
        ) : patientMatches.length ? (
          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-950/30">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Matching patients</div>
            <div className="mt-2 grid gap-1">
              {patientMatches.map((match) => (
                <button
                  key={match.patientId}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-900/60"
                  onClick={() => selectPatient(match)}
                >
                  <span className="font-medium">{match.name || "Patient"}</span>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{match.patientId}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      {patientAddress ? (
        <Card title="Access Status">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              Patient: {patientName ? `${patientName} (${patientId || "—"})` : `Patient ID: ${patientId || "—"}`}
            </span>
            <StatusBadge status={patientAccessStatus || "unknown"} />
            <span className="text-xs text-slate-600">{accessBadge}</span>
            {accessExpiry > 0 ? (
              <span className="text-xs text-slate-500">
                Access valid until: {new Date(accessExpiry * 1000).toLocaleString()}
              </span>
            ) : null}
            {unlockStats.total > 0 ? (
              <span className="text-xs text-slate-500">
                Session keys: {unlockStats.cached}/{unlockStats.total}
              </span>
            ) : null}
          </div>

          {patientAccessStatus !== "approved" ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                You do not have access to this patient&apos;s records.
              </p>
              <Button
                type="button"
                variant="accent"
                className="mt-3"
                loading={actionLoading === "request"}
                disabled={patientAccessStatus === "pending"}
                onClick={requestFullAccess}
              >
                Request Full Access
              </Button>
            </div>
          ) : (
            <div className="mt-4">
              <Button
                type="button"
                variant="ghost"
                loading={unlockLoading}
                onClick={unlockSessionKeys}
              >
                Unlock Session Keys
              </Button>
            </div>
          )}
        </Card>
      ) : null}

      <Card title="Patient Files">
        {loadingSearch ? (
          <Loader label="Loading files..." />
        ) : files.length === 0 ? (
          <EmptyState title="No files found" description="Search a patient to view records." />
        ) : (
          <>
            <div className="mb-3">
              <Input
                id="providerFileSearch"
                label="Search files"
                value={fileSearchQuery}
                onChange={(event) => setFileSearchQuery(event.target.value)}
                autoComplete="off"
              />
            </div>
            {filteredFiles.length === 0 ? (
              <EmptyState title="No matching files" description="Try a different search term." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredFiles.map((file) => {
              const loadingPrint = actionLoading === `print_${file.cid}`;
              const loadingView = actionLoading === `view_${file.cid}`;
              const { keyCandidate, ivCandidate } = getEncryptedMaterial(file);
              const hasWrappedKey = Boolean(file.encryptedKeyForProvider && file.iv);
              const hasLegacyKey = Boolean(
                !isWrappedKey(keyCandidate) && keyCandidate && ivCandidate
              );
              const hasKeyMaterial = hasWrappedKey || hasLegacyKey;
                  return (
                    <div
                      key={file._id || file.cid}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-950/30"
                    >
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{file.fileName}</p>
                      {file.fileType && file.fileType !== "Unknown" && file.fileType !== "Unknown type" ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{file.fileType}</p>
                  ) : null}
                  {!hasKeyMaterial ? (
                    <p className="mt-2 text-xs text-amber-700">
                      This file was uploaded before auto-decryption metadata was enabled.
                      Patient must re-upload this file.
                    </p>
                  ) : null}
                  <div className="mt-3">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        loading={loadingView}
                        disabled={patientAccessStatus !== "approved" || !hasKeyMaterial}
                        onClick={() => viewFile(file)}
                      >
                        View File
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        loading={loadingPrint}
                        disabled={patientAccessStatus !== "approved" || !hasKeyMaterial}
                        onClick={() => printFile(file)}
                      >Print</Button>
                    </div>
                  </div>
                </div>
              );
                })}
              </div>
            )}
          </>
        )}
      </Card>

      <Modal
        open={preview.open}
        title={`Preview: ${preview.name}`}
        onClose={closePreview}
      >
        {preview.isDicom ? (
          <DicomViewer url={preview.url} />
        ) : preview.isNifti ? (
          <NiftiViewer url={preview.url} />
        ) : preview.type.startsWith("image/") ? (
          <img src={preview.url} alt={preview.name} className="max-h-[70vh] w-full object-contain" />
        ) : preview.type === "application/pdf" ? (
          <iframe
            src={preview.url}
            title={preview.name}
            className="h-[70vh] w-full rounded-xl border border-slate-200 dark:border-slate-600"
          />
        ) : preview.type.startsWith("video/") ? (
          <video src={preview.url} controls className="max-h-[70vh] w-full rounded-xl" />
        ) : preview.type.startsWith("audio/") ? (
          <audio src={preview.url} controls className="w-full" />
        ) : preview.type.startsWith("text/") ? (
          <iframe
            src={preview.url}
            title={preview.name}
            className="h-[70vh] w-full rounded-xl border border-slate-200 dark:border-slate-600"
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              This file type cannot be previewed in-browser.
            </p>
            <Button type="button" variant="ghost" onClick={closePreview}>
              Close Preview
            </Button>
          </div>
        )}
      </Modal>

      <div className="fixed right-4 top-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={removeToast} />
        ))}
      </div>
    </div>
  );
}


