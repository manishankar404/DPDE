import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatApiError,
  getFilesByPatient,
  getMyProviderProfile,
  getPatientById,
  logProviderFileAction,
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
  const [patientIdError, setPatientIdError] = useState("");
  const [patientAddress, setPatientAddress] = useState("");
  const [files, setFiles] = useState([]);
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

  async function searchPatientFiles() {
    if (!patientId.trim()) {
      setPatientIdError("Patient ID is required.");
      return;
    }

    setPatientIdError("");
    setLoadingSearch(true);
    try {
      const trimmedId = patientId.trim();
      const providerWallet = user?.walletAddress || (await getCurrentWalletAddress());

      // Fetch patient first so the access UI renders even if file listing is forbidden.
      const patient = await getPatientById(trimmedId);
      setPatientAddress(patient.walletAddress);

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
        return;
      }

      const fileList = await getFilesByPatient(trimmedId, providerWallet);
      setFiles(Array.isArray(fileList) ? fileList : []);
    } catch (error) {
      setFiles([]);
      setPatientAddress("");
      addToast(formatApiError(error, "Failed to search patient records."), "error");
    } finally {
      setLoadingSearch(false);
    }
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

  async function openFile(file) {
    if (!patientAddress) return;
    setActionLoading(`open_${file.cid}`);
    try {
      const { url, providerAddress } = await decryptToObjectUrl(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.fileName || "record";
      document.body.appendChild(link);
      link.click();
      link.remove();
      addToast(`Opened file as ${providerAddress.slice(0, 6)}...`, "success");
      if (patientId && file?.cid) {
        logProviderFileAction({ action: "DOWNLOAD_FILE", cid: file.cid, patientId }).catch(() => {});
      }
    } catch (error) {
      addToast(formatApiError(error, "Failed to open file."), "error");
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
      <Card title="Your Profile">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={openProfileEditor}>
            Edit Profile
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium text-slate-500">Name</div>
            <div className="text-sm font-semibold text-slate-900">{user?.name || "Doctor"}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Hospital</div>
            <div className="text-sm text-slate-700">{user?.hospitalName || "—"}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Specialization</div>
            <div className="text-sm text-slate-700">{user?.specialization || "—"}</div>
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

      <Card title="Search Patient Records" subtitle="Enter patient ID to retrieve all files">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            id="providerPatientId"
            label="Patient ID"
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
            error={patientIdError}
          />
          <Button
            type="button"
            className="h-11 md:self-end"
            loading={loadingSearch}
            onClick={searchPatientFiles}
          >
            Search Files
          </Button>
        </div>
      </Card>

      {patientAddress ? (
        <Card title="Access Status">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              Patient ID: {patientId || "—"}
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
          <div className="grid gap-4 md:grid-cols-2">
            {files.map((file) => {
              const loadingDownload = actionLoading === `open_${file.cid}`;
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
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="text-sm font-semibold text-slate-800">{file.fileName}</p>
                  {file.fileType && file.fileType !== "Unknown" && file.fileType !== "Unknown type" ? (
                    <p className="mt-1 text-xs text-slate-500">{file.fileType}</p>
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
                        loading={loadingDownload}
                        disabled={patientAccessStatus !== "approved" || !hasKeyMaterial}
                        onClick={() => openFile(file)}
                      >
                        Download
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
            className="h-[70vh] w-full rounded-xl border border-slate-200"
          />
        ) : preview.type.startsWith("video/") ? (
          <video src={preview.url} controls className="max-h-[70vh] w-full rounded-xl" />
        ) : preview.type.startsWith("audio/") ? (
          <audio src={preview.url} controls className="w-full" />
        ) : preview.type.startsWith("text/") ? (
          <iframe
            src={preview.url}
            title={preview.name}
            className="h-[70vh] w-full rounded-xl border border-slate-200"
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

