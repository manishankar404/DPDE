import { useEffect, useMemo, useRef, useState } from "react";
import { encrypt } from "@metamask/eth-sig-util";
import { Buffer } from "buffer";
import {
  formatApiError,
  getPatientAuditLogs,
  getMyPatientProfile,
  getFilesByPatient,
  getProviderByWallet,
  registerFile,
  resolveProfiles,
  updateMyPatientProfile,
  revokeWrappedKeys,
  wrapKeyForProvider
} from "../api";
import { ensureSepolia, grantAccess, rejectAccessRequest, revokeAccess, getAccessExpiry } from "../blockchain/consent";
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
import { encryptFile } from "../encrypt";
import { uploadToIPFS } from "../upload";
import { formatActionLog, formatProvider, shortenWallet } from "../utils/formatters";

const ACTION_BADGE_STYLES = {
  UPLOAD: "bg-blue-100 text-blue-800 border-blue-200",
  REQUEST_ACCESS: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVE: "bg-green-100 text-green-800 border-green-200",
  REJECT: "bg-red-100 text-red-800 border-red-200",
  REVOKE: "bg-orange-100 text-orange-800 border-orange-200",
  VIEW_FILE: "bg-purple-100 text-purple-800 border-purple-200",
  DOWNLOAD_FILE: "bg-teal-100 text-teal-800 border-teal-200",
  DEFAULT: "bg-slate-100 text-slate-700 border-slate-200"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function decodeArray(encoded) {
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(atob(encoded));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function bufferToHex(buffer) {
  return `0x${Buffer.from(buffer).toString("hex")}`;
}

function base64ToBytes(value) {
  if (!value) return [];
  const binary = atob(value);
  return Array.from(binary).map((char) => char.charCodeAt(0));
}

async function getEncryptionPublicKey(address) {
  const storageKey = `dpde_enc_pubkey_${address.toLowerCase()}`;
  const cached = localStorage.getItem(storageKey);
  if (cached) return cached;
  const publicKey = await window.ethereum.request({
    method: "eth_getEncryptionPublicKey",
    params: [address]
  });
  localStorage.setItem(storageKey, publicKey);
  return publicKey;
}

async function decryptKeyWithWallet(encryptedKeyHex, walletAddress) {
  return window.ethereum.request({
    method: "eth_decrypt",
    params: [encryptedKeyHex, walletAddress]
  });
}

function getEncryptedMaterial(file) {
  const keyCandidate =
    file.encryptedKey ||
    file.encryptedKeyForProvider ||
    file.keyCipher ||
    file.key ||
    "";
  const ivCandidate =
    file.encryptedIv ||
    file.encryptedIvForProvider ||
    file.ivCipher ||
    file.iv ||
    "";
  return { keyCandidate, ivCandidate };
}

const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://w3s.link/ipfs/"
];
const DEFAULT_ACCESS_DURATION = 24 * 60 * 60;
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

export default function PatientDashboard() {
  const { user, updateUser } = useAuth();
  const { pendingRequests, grantedProviders, refreshPendingRequests, refreshGrantedProviders } =
    useAccess();
  const fileInputRef = useRef(null);
  const objectUrlsRef = useRef([]);

  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [actionLoadingKey, setActionLoadingKey] = useState("");
  const [fileActionLoading, setFileActionLoading] = useState("");
  const [accessActionLoading, setAccessActionLoading] = useState("");
  const [accessExpiryByProvider, setAccessExpiryByProvider] = useState({});
  const [latestCid, setLatestCid] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockStats, setUnlockStats] = useState({ total: 0, cached: 0 });
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState("all");
  const [exportingLogs, setExportingLogs] = useState(false);
  const [profilesByWallet, setProfilesByWallet] = useState({});
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", email: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadPreview, setUploadPreview] = useState({ files: [], blocked: [] });
  const [preview, setPreview] = useState({
    open: false,
    url: "",
    type: "",
    name: "",
    isDicom: false,
    isNifti: false
  });
  const [toasts, setToasts] = useState([]);
  const keyCacheRef = useRef(new Map());

  function addToast(message, tone = "info") {
    setToasts((prev) => [...prev, { id: `${Date.now()}_${Math.random()}`, message, tone }]);
  }

  function removeToast(id) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    keyCacheRef.current.clear();
    setUnlockStats({ total: 0, cached: 0 });
  }, [user?.walletAddress]);

  useEffect(() => {
    let active = true;

    async function loadMyProfile() {
      if (!user?.walletAddress) return;
      try {
        const profile = await getMyPatientProfile();
        if (!active || !profile) return;
        updateUser({
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          patientId: profile.patientId,
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

  function closePreview() {
    if (preview.url) {
      URL.revokeObjectURL(preview.url);
      objectUrlsRef.current = objectUrlsRef.current.filter((item) => item !== preview.url);
    }
    setPreview({ open: false, url: "", type: "", name: "", isDicom: false, isNifti: false });
  }

  const metrics = useMemo(
    () => ({
      totalFiles: files.length,
      pendingRequests: pendingRequests.length,
      activeProviders: grantedProviders.length
    }),
    [files.length, pendingRequests.length, grantedProviders.length]
  );

  async function loadFiles() {
    if (!user?.patientId) return;
    setLoadingFiles(true);
    try {
      const list = await getFilesByPatient(user.patientId);
      setFiles(Array.isArray(list) ? list : []);
    } catch (error) {
      addToast(formatApiError(error, "Failed to load file history."), "error");
    } finally {
      setLoadingFiles(false);
    }
  }

  function openProfileEditor() {
    setProfileForm({
      name: user?.name || "",
      email: user?.email || "",
      phone: user?.phone || ""
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
      const updated = await updateMyPatientProfile({
        name: profileForm.name.trim(),
        email: profileForm.email.trim(),
        phone: profileForm.phone.trim()
      });
      updateUser({
        name: updated?.name || profileForm.name.trim(),
        email: updated?.email || profileForm.email.trim(),
        phone: updated?.phone || profileForm.phone.trim()
      });
      addToast("Profile updated.", "success");
      setProfileModalOpen(false);
    } catch (error) {
      addToast(formatApiError(error, "Failed to update profile."), "error");
    } finally {
      setSavingProfile(false);
    }
  }

  async function loadAuditLogs() {
    const wallet = user?.walletAddress;
    if (!wallet) return;
    setLoadingLogs(true);
    try {
      const list = await getPatientAuditLogs(wallet);
      setLogs(Array.isArray(list) ? list : []);
    } catch (error) {
      addToast(formatApiError(error, "Failed to load activity history."), "error");
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }

  async function downloadAuditPdf() {
    const wallet = user?.walletAddress;
    if (!wallet) return;

    setExportingLogs(true);
    try {
      const list = await getPatientAuditLogs(wallet, { limit: 1000 });
      const exportLogs = Array.isArray(list) ? list : [];

      const rowsHtml = exportLogs
        .map((log) => {
          const action = escapeHtml(log.action || "");
          const timestamp = escapeHtml(
            log.timestamp ? new Date(log.timestamp).toLocaleString() : ""
          );
          const description = escapeHtml(formatActionLog(log) || "");

          return `
            <tr>
              <td>${timestamp}</td>
              <td><span class="badge badge-${action}">${action || "UNKNOWN"}</span></td>
              <td>${description}</td>
            </tr>
          `;
        })
        .join("");

      const html = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>DPDE Activity History</title>
            <style>
              @page { size: A4; margin: 14mm; }
              body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color: #0f172a; }
              h1 { font-size: 16px; margin: 0 0 8px; }
              .sub { font-size: 12px; color: #475569; margin: 0 0 14px; }
              table { width: 100%; border-collapse: collapse; font-size: 11px; }
              th, td { border: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; }
              th { background: #f8fafc; text-align: left; }
              .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
              .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; border: 1px solid #e2e8f0; font-weight: 600; }
              .badge-UPLOAD { background: #dbeafe; border-color: #bfdbfe; color: #1e40af; }
              .badge-REQUEST_ACCESS { background: #fef3c7; border-color: #fde68a; color: #92400e; }
              .badge-APPROVE { background: #dcfce7; border-color: #bbf7d0; color: #166534; }
              .badge-REJECT { background: #fee2e2; border-color: #fecaca; color: #991b1b; }
              .badge-REVOKE { background: #ffedd5; border-color: #fed7aa; color: #9a3412; }
              .badge-VIEW_FILE { background: #ede9fe; border-color: #ddd6fe; color: #5b21b6; }
              .badge-DOWNLOAD_FILE { background: #ccfbf1; border-color: #99f6e4; color: #115e59; }
              .badge-UNKNOWN { background: #f1f5f9; border-color: #e2e8f0; color: #334155; }
              @media print { .sub { page-break-after: avoid; } tr { page-break-inside: avoid; } }
            </style>
          </head>
          <body>
            <h1>Recent Activity</h1>
            <p class="sub">
              Patient: ${escapeHtml(shortenWallet(wallet))} • Generated: ${escapeHtml(
                new Date().toLocaleString()
              )} • Records: ${exportLogs.length}
            </p>
            <table>
              <thead>
                <tr>
                  <th style="width: 16%;">Timestamp</th>
                  <th style="width: 12%;">Action</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </body>
        </html>
      `;

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.setAttribute("aria-hidden", "true");
      document.body.appendChild(iframe);

      const frameWindow = iframe.contentWindow;
      const frameDocument = iframe.contentDocument || frameWindow?.document;
      if (!frameWindow || !frameDocument) {
        iframe.remove();
        throw new Error("Unable to open print frame.");
      }

      frameDocument.open();
      frameDocument.write(html);
      frameDocument.close();

      const cleanup = () => {
        try {
          iframe.remove();
        } catch {
          // ignore
        }
      };

      const triggerPrint = () => {
        try {
          frameWindow.focus();
          frameWindow.print();
        } finally {
          // Some browsers don't reliably fire `afterprint` from iframes.
          setTimeout(cleanup, 1000);
        }
      };

      frameWindow.onafterprint = cleanup;
      iframe.onload = triggerPrint;
      setTimeout(triggerPrint, 600);
    } catch (error) {
      addToast(formatApiError(error, "Failed to export activity history."), "error");
    } finally {
      setExportingLogs(false);
    }
  }

  async function refreshAll() {
    await Promise.all([
      loadFiles(),
      loadAuditLogs(),
      refreshPendingRequests(user?.walletAddress),
      refreshGrantedProviders(user?.walletAddress)
    ]);
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.patientId, user?.walletAddress]);

  useEffect(() => {
    const wallets = Array.from(new Set([...(pendingRequests || []), ...(grantedProviders || [])]))
      .map((wallet) => String(wallet || "").toLowerCase())
      .filter(Boolean);

    if (wallets.length === 0) {
      setProfilesByWallet({});
      return;
    }

    resolveProfiles(wallets)
      .then((response) => {
        const profiles = response?.profiles || {};
        setProfilesByWallet(profiles && typeof profiles === "object" ? profiles : {});
      })
      .catch(() => {
        setProfilesByWallet({});
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRequests, grantedProviders]);

  const filteredLogs = useMemo(() => {
    if (!Array.isArray(logs)) return [];
    if (logFilter === "uploads") return logs.filter((log) => log.action === "UPLOAD");
    if (logFilter === "requests") return logs.filter((log) => log.action === "REQUEST_ACCESS");
    if (logFilter === "approvals")
      return logs.filter((log) => ["APPROVE", "REJECT", "REVOKE"].includes(log.action));
    if (logFilter === "file")
      return logs.filter((log) => ["VIEW_FILE", "DOWNLOAD_FILE"].includes(log.action));
    return logs;
  }, [logs, logFilter]);

  useEffect(() => {
    let active = true;

    async function loadExpiries() {
      if (!user?.walletAddress || grantedProviders.length === 0) {
        if (active) setAccessExpiryByProvider({});
        return;
      }

      try {
        const entries = await Promise.all(
          grantedProviders.map(async (provider) => {
            const expiry = await getAccessExpiry(user.walletAddress, provider);
            return [provider, Number(expiry) || 0];
          })
        );
        if (active) {
          setAccessExpiryByProvider(Object.fromEntries(entries));
        }
      } catch {
        if (active) setAccessExpiryByProvider({});
      }
    }

    loadExpiries();
    return () => {
      active = false;
    };
  }, [grantedProviders, user?.walletAddress]);

  function normalizeFiles(input) {
    if (!input) return [];
    return Array.isArray(input) ? input : Array.from(input);
  }

  function getExtension(fileName) {
    const name = (fileName || "").toLowerCase();
    if (name.endsWith(".nii.gz")) return ".nii.gz";
    if (name.endsWith(".img.gz")) return ".img.gz";
    const idx = name.lastIndexOf(".");
    return idx >= 0 ? name.slice(idx) : "";
  }

  function isSupportedFile(file) {
    const name = (file.name || "").toLowerCase();
    const ext = getExtension(name);
    if (ext === ".hdr" || ext === ".img" || ext === ".img.gz") return false;
    if (ext === ".nii" || ext === ".nii.gz" || ext === ".nia") return true;
    if (ext === ".dcm" || ext === ".dicom") return true;
    if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".bmp") return true;
    if (ext === ".tif" || ext === ".tiff") return true;
    if (ext === ".pdf") return true;
    if (file.type?.startsWith("image/")) return true;
    if (file.type?.startsWith("audio/")) return true;
    if (file.type?.startsWith("video/")) return true;
    if (file.type?.startsWith("text/")) return true;
    return false;
  }

  function splitUploads(selectedFiles) {
    const files = normalizeFiles(selectedFiles);
    const supported = [];
    const blocked = [];

    files.forEach((file) => {
      if (isSupportedFile(file)) {
        supported.push(file);
      } else {
        blocked.push(file.name);
      }
    });

    return {
      ok: supported.length > 0,
      files: supported,
      preview: { files: supported.map((file) => file.name), blocked },
      error: supported.length ? "" : "No supported files selected."
    };
  }

  async function uploadFile(file) {
    if (!file || !user?.patientId) return;

    setUploading(true);
    setUploadProgress(10);
    try {
      if (!window.ethereum) {
        throw new Error("MetaMask not found.");
      }
      await ensureSepolia();
      const [walletAddress] = await window.ethereum.request({
        method: "eth_requestAccounts"
      });
      if (!walletAddress) {
        throw new Error("Wallet connection required.");
      }

      const encrypted = await encryptFile(file);
      setUploadProgress(35);

      const publicKey = await getEncryptionPublicKey(walletAddress);
      const aesKeyBase64 = bytesToBase64(encrypted.key);
      const encryptedKeyObject = encrypt({
        publicKey,
        data: aesKeyBase64,
        version: "x25519-xsalsa20-poly1305"
      });
      const encryptedKeyHex = bufferToHex(
        Buffer.from(JSON.stringify(encryptedKeyObject), "utf8")
      );

      const uploadedCid = await uploadToIPFS(encrypted.encryptedBlob);
      setUploadProgress(60);

      setUploadProgress(80);

      await registerFile({
        cid: uploadedCid,
        patientId: user.patientId,
        fileName: file.name,
        fileType: file.type || "",
        iv: bytesToBase64(encrypted.iv),
        encryptedKeyForPatient: encryptedKeyHex
      });

      setUploadProgress(100);
      setLatestCid(uploadedCid);
      addToast("File uploaded and registered securely.", "success");
      await loadFiles();
    } catch (error) {
      addToast(formatApiError(error, "Upload failed."), "error");
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 350);
    }
  }

  async function uploadFiles(inputFiles) {
    const { ok, files: filesToUpload, error, preview } = splitUploads(inputFiles);
    if (preview) setUploadPreview(preview);
    if (!ok) {
      addToast(error || "No supported files selected.", "warning");
      return;
    }

    let uploadedCount = 0;
    for (const file of filesToUpload) {
      // eslint-disable-next-line no-await-in-loop
      await uploadFile(file);
      uploadedCount += 1;
    }
    if (uploadedCount > 1) {
      addToast(`${uploadedCount} files uploaded.`, "success");
    }
    setUploadPreview({ files: [], blocked: [] });
  }

  function onDrop(event) {
    event.preventDefault();
    setDragActive(false);
    const dropped = event.dataTransfer?.files;
    if (dropped?.length) {
      uploadFiles(dropped);
    }
  }

  async function wrapKeysForProvider(provider) {
    if (!window.ethereum) {
      throw new Error("MetaMask not found.");
    }
    await ensureSepolia();
    const patientWallet = user?.walletAddress;
    if (!patientWallet) {
      throw new Error("Patient wallet address missing.");
    }

    let providerPublicKey = "";
    try {
      providerPublicKey = await getEncryptionPublicKey(provider);
    } catch {
      const providerRecord = await getProviderByWallet(provider);
      providerPublicKey = providerRecord?.encryptionPublicKey || "";
    }
    if (!providerPublicKey) {
      throw new Error("Provider encryption key not found.");
    }

    for (const file of files) {
      if (!file.encryptedKeyForPatient && !file.encryptedKey) {
        continue;
      }
      let aesKeyBase64 = "";
      if (file.encryptedKeyForPatient) {
        aesKeyBase64 = await decryptKeyWithWallet(
          file.encryptedKeyForPatient,
          patientWallet
        );
      } else if (file.encryptedKey) {
        const legacyKey = decodeArray(file.encryptedKey);
        aesKeyBase64 = bytesToBase64(legacyKey);
      }
      if (!aesKeyBase64) continue;

      const encryptedKeyObject = encrypt({
        publicKey: providerPublicKey,
        data: aesKeyBase64,
        version: "x25519-xsalsa20-poly1305"
      });
      const encryptedKeyHex = bufferToHex(
        Buffer.from(JSON.stringify(encryptedKeyObject), "utf8")
      );

      await wrapKeyForProvider({
        fileId: file._id,
        providerWallet: provider,
        encryptedKeyForProvider: encryptedKeyHex
      });
    }
  }

  async function approveProvider(provider) {
    setActionLoadingKey(provider);
    try {
      await wrapKeysForProvider(provider);
      await grantAccess(provider, DEFAULT_ACCESS_DURATION);
      addToast("Provider access granted.", "success");
      await Promise.all([
        refreshPendingRequests(user.walletAddress),
        refreshGrantedProviders(user.walletAddress)
      ]);
    } catch (error) {
      addToast(formatApiError(error, "Failed to approve provider."), "error");
    } finally {
      setActionLoadingKey("");
    }
  }

  async function rejectProvider(provider) {
    setActionLoadingKey(provider);
    try {
      await rejectAccessRequest(provider);
      addToast("Provider request rejected.", "warning");
      await refreshPendingRequests(user.walletAddress);
    } catch (error) {
      addToast(formatApiError(error, "Failed to reject request."), "error");
    } finally {
      setActionLoadingKey("");
    }
  }

  async function revokeProviderAccess(provider) {
    setAccessActionLoading(`revoke_${provider}`);
    try {
      await revokeAccess(provider);
      await revokeWrappedKeys({
        patientId: user.patientId,
        providerWallet: provider
      });
      addToast("Provider access revoked.", "success");
      await refreshGrantedProviders(user.walletAddress);
    } catch (error) {
      addToast(formatApiError(error, "Failed to revoke access."), "error");
    } finally {
      setAccessActionLoading("");
    }
  }

  async function rewrapProviderKeys(provider) {
    setAccessActionLoading(`wrap_${provider}`);
    try {
      await wrapKeysForProvider(provider);
      addToast("Keys re-wrapped for provider.", "success");
    } catch (error) {
      addToast(formatApiError(error, "Failed to re-wrap keys."), "error");
    } finally {
      setAccessActionLoading("");
    }
  }

  async function decryptToObjectUrl(file) {
    let key = [];
    let iv = [];
    const cacheKey = file.cid || file._id || "";
    if (file.encryptedKeyForPatient && file.iv) {
      if (cacheKey && keyCacheRef.current.has(cacheKey)) {
        const cached = keyCacheRef.current.get(cacheKey);
        key = cached.key;
        iv = cached.iv;
      } else {
        if (!window.ethereum) {
          throw new Error("MetaMask not found.");
        }
        await ensureSepolia();
        const aesKeyBase64 = await decryptKeyWithWallet(
          file.encryptedKeyForPatient,
          user?.walletAddress
        );
        key = base64ToBytes(aesKeyBase64);
        iv = base64ToBytes(file.iv);
        if (cacheKey && key.length && iv.length) {
          keyCacheRef.current.set(cacheKey, { key, iv });
        }
      }
    } else {
      const { keyCandidate, ivCandidate } = getEncryptedMaterial(file);
      key = decodeArray(keyCandidate);
      iv = decodeArray(ivCandidate);
    }

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
    return { url, mimeType };
  }

  async function openFile(file) {
    setFileActionLoading(`open_${file.cid}`);
    try {
      const { url } = await decryptToObjectUrl(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.fileName || "record";
      document.body.appendChild(link);
      link.click();
      link.remove();
      addToast("File download started.", "success");
    } catch (error) {
      addToast(formatApiError(error, "Failed to download file."), "error");
    } finally {
      setFileActionLoading("");
    }
  }

  async function viewFile(file) {
    setFileActionLoading(`view_${file.cid}`);
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
    } catch (error) {
      addToast(formatApiError(error, "Failed to preview file."), "error");
    } finally {
      setFileActionLoading("");
    }
  }

  async function unlockSessionKeys() {
    setUnlockLoading(true);
    try {
      const filesNeedingKeys = files.filter(
        (file) => file.encryptedKeyForPatient && file.iv
      );
      let cached = 0;

      for (const file of filesNeedingKeys) {
        const cacheKey = file.cid || file._id || "";
        if (cacheKey && keyCacheRef.current.has(cacheKey)) {
          cached += 1;
          continue;
        }
        try {
          const aesKeyBase64 = await decryptKeyWithWallet(
            file.encryptedKeyForPatient,
            user?.walletAddress
          );
          const key = base64ToBytes(aesKeyBase64);
          const iv = base64ToBytes(file.iv);
          if (cacheKey && key.length && iv.length) {
            keyCacheRef.current.set(cacheKey, { key, iv });
            cached += 1;
          }
        } catch {
          // ignore individual failures
        }
      }

      setUnlockStats({ total: filesNeedingKeys.length, cached });
      addToast("Session keys cached for your files.", "success");
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
            <div className="text-sm font-semibold text-slate-900">{user?.name || "Patient"}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Patient ID</div>
            <div className="text-sm text-slate-700">{user?.patientId || "—"}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Wallet</div>
            <div className="font-mono text-sm text-slate-700">
              {shortenWallet(user?.walletAddress) || "—"}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <p className="text-sm text-slate-500">Total Files</p>
          <p className="mt-2 text-2xl font-bold text-healthcare-blue">{metrics.totalFiles}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Doctor Requests</p>
          <p className="mt-2 text-2xl font-bold text-healthcare-warning">
            {metrics.pendingRequests}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Doctors with Access</p>
          <p className="mt-2 text-2xl font-bold text-healthcare-teal">
            {metrics.activeProviders}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Session Keys Cached</p>
          <p className="mt-2 text-2xl font-bold text-healthcare-blue">
            {unlockStats.cached}/{unlockStats.total}
          </p>
        </Card>
      </div>

      <Card
        title="Upload Files"
        subtitle="Files are encrypted and can be opened automatically after access approval"
      >
        <div
          className={[
            "rounded-2xl border-2 border-dashed p-8 text-center transition",
            dragActive ? "border-healthcare-teal bg-teal-50" : "border-slate-300 bg-slate-50"
          ].join(" ")}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
        >
          <p className="mb-3 text-sm text-slate-600">
            Supported: DICOM (.dcm/.dicom), NIfTI (.nii/.nii.gz/.nia), images, PDF, text,
            audio, video. Unsupported formats will be blocked.
          </p>
          <Button type="button" variant="accent" onClick={() => fileInputRef.current?.click()}>
            Select File
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={(event) => uploadFiles(event.target.files)}
          />
        </div>

        {uploadPreview.files.length ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <p className="font-medium text-slate-700">Ready to upload</p>
            <ul className="mt-2 space-y-1 text-slate-600">
              {uploadPreview.files.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {uploadPreview.blocked.length ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Blocked files: {uploadPreview.blocked.join(", ")}
          </div>
        ) : null}

        {uploading ? (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-healthcare-teal transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-slate-600">Uploading... {uploadProgress}%</p>
          </div>
        ) : null}

      </Card>

      <Card title="Doctor Access Requests" subtitle="Approve or reject access requests">
        {pendingRequests.length === 0 ? (
          <EmptyState
            title="No pending provider requests"
            description="New access requests will appear here."
          />
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {pendingRequests.map((provider) => {
                const isBusy = actionLoadingKey === provider;
                const profile = profilesByWallet[String(provider || "").toLowerCase()] || {};
                const providerLabel = formatProvider({
                  providerWallet: provider,
                  providerName: profile.name,
                  providerDisplay: profile.display
                });

                return (
                  <div
                    key={provider}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-500">Doctor</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {providerLabel}
                        </div>
                      </div>
                      <StatusBadge status="pending" />
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="success"
                        className="w-full"
                        loading={isBusy}
                        onClick={() => approveProvider(provider)}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        className="w-full"
                        loading={isBusy}
                        onClick={() => rejectProvider(provider)}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2">Doctor</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRequests.map((provider) => {
                    const isBusy = actionLoadingKey === provider;
                    const profile =
                      profilesByWallet[String(provider || "").toLowerCase()] || {};
                    const providerLabel = formatProvider({
                      providerWallet: provider,
                      providerName: profile.name,
                      providerDisplay: profile.display
                    });

                    return (
                      <tr key={provider} className="border-b border-slate-100">
                        <td className="py-3 text-sm font-semibold text-slate-900">
                          {providerLabel}
                        </td>
                        <td className="py-3">
                          <StatusBadge status="pending" />
                        </td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="success"
                              loading={isBusy}
                              onClick={() => approveProvider(provider)}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              loading={isBusy}
                              onClick={() => rejectProvider(provider)}
                            >
                              Reject
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card title="Doctors with Access" subtitle="Doctors who currently have access">
        {grantedProviders.length === 0 ? (
          <EmptyState
            title="No active access"
            description="Doctors you approve will appear here."
          />
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {grantedProviders.map((provider) => {
                const isRevoking = accessActionLoading === `revoke_${provider}`;
                const isWrapping = accessActionLoading === `wrap_${provider}`;
                const expiryLabel = accessExpiryByProvider[provider]
                  ? new Date(accessExpiryByProvider[provider] * 1000).toLocaleString()
                  : "Unknown";
                const profile = profilesByWallet[String(provider || "").toLowerCase()] || {};
                const providerLabel = formatProvider({
                  providerWallet: provider,
                  providerName: profile.name,
                  providerDisplay: profile.display
                });

                return (
                  <div
                    key={provider}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-500">Doctor</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {providerLabel}
                        </div>
                      </div>
                      <StatusBadge status="approved" />
                    </div>

                    <div className="mt-3 text-xs text-slate-600">
                      <span className="font-medium text-slate-500">Expires:</span>{" "}
                      {expiryLabel}
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        loading={isWrapping}
                        onClick={() => rewrapProviderKeys(provider)}
                      >
                        Re-wrap Keys
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        className="w-full"
                        loading={isRevoking}
                        onClick={() => revokeProviderAccess(provider)}
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2">Doctor</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Expires</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {grantedProviders.map((provider) => {
                    const isRevoking = accessActionLoading === `revoke_${provider}`;
                    const isWrapping = accessActionLoading === `wrap_${provider}`;
                    const profile =
                      profilesByWallet[String(provider || "").toLowerCase()] || {};
                    const providerLabel = formatProvider({
                      providerWallet: provider,
                      providerName: profile.name,
                      providerDisplay: profile.display
                    });
                    return (
                      <tr key={provider} className="border-b border-slate-100">
                        <td className="py-3 text-sm font-semibold text-slate-900">
                          {providerLabel}
                        </td>
                        <td className="py-3">
                          <StatusBadge status="approved" />
                        </td>
                        <td className="py-3 text-xs text-slate-600">
                          {accessExpiryByProvider[provider]
                            ? new Date(accessExpiryByProvider[provider] * 1000).toLocaleString()
                            : "Unknown"}
                        </td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              loading={isWrapping}
                              onClick={() => rewrapProviderKeys(provider)}
                            >
                              Re-wrap Keys
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              loading={isRevoking}
                              onClick={() => revokeProviderAccess(provider)}
                            >
                              Revoke
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card title="Your Medical Files">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            loading={unlockLoading}
            onClick={unlockSessionKeys}
          >
            Unlock Session Keys
          </Button>
        </div>
        {loadingFiles ? (
          <Loader label="Loading file history..." />
        ) : files.length === 0 ? (
          <EmptyState title="No files uploaded yet" description="Upload your first file to begin." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {files.map((file) => {
              const loadingDownload = fileActionLoading === `open_${file.cid}`;
              const loadingView = fileActionLoading === `view_${file.cid}`;
              const { keyCandidate, ivCandidate } = getEncryptedMaterial(file);
              const hasKeyMaterial = Boolean(
                (file.encryptedKeyForPatient && file.iv) || (keyCandidate && ivCandidate)
              );
              return (
                <div
                  key={file._id || `${file.cid}_${file.uploadedAt}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="text-sm font-semibold text-slate-800">{file.fileName}</p>
                  {file.fileType && file.fileType !== "Unknown" && file.fileType !== "Unknown type" ? (
                    <p className="mt-1 text-xs text-slate-500">{file.fileType}</p>
                  ) : null}
                  {!hasKeyMaterial ? (
                    <p className="mt-2 text-xs text-amber-700">
                      This file was uploaded before auto-decryption metadata was enabled. Please
                      re-upload the file.
                    </p>
                  ) : null}
                  <div className="mt-3">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        loading={loadingView}
                        disabled={!hasKeyMaterial}
                        onClick={() => viewFile(file)}
                      >
                        View File
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        loading={loadingDownload}
                        disabled={!hasKeyMaterial}
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

      <Card title="Recent Activity">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-500">
            Recent actions across uploads, access changes, and doctor activity.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
              value={logFilter}
              onChange={(event) => setLogFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="uploads">Uploads</option>
              <option value="requests">Access Requests</option>
              <option value="approvals">Approvals</option>
              <option value="file">File Activity</option>
            </select>
            <Button
              type="button"
              variant="ghost"
              loading={exportingLogs}
              disabled={loadingLogs || exportingLogs}
              onClick={downloadAuditPdf}
            >
              Download PDF
            </Button>
          </div>
        </div>

        {loadingLogs ? (
          <Loader label="Loading activity history..." />
        ) : filteredLogs.length === 0 ? (
          <EmptyState title="No activity yet" description="Your recent activity will show up here." />
        ) : (
          <div className="grid gap-3">
            {filteredLogs.map((log) => {
              const badgeStyle =
                ACTION_BADGE_STYLES[log.action] || ACTION_BADGE_STYLES.DEFAULT;
              const timestampLabel = log.timestamp
                ? new Date(log.timestamp).toLocaleString()
                : "";
              const description = formatActionLog(log);

              return (
                <div
                  key={log._id || `${log.action}_${log.timestamp}_${log.cid || ""}_${log.providerWallet || ""}`}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span
                      className={[
                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                        badgeStyle
                      ].join(" ")}
                    >
                      {log.action || "UNKNOWN"}
                    </span>
                    <div className="text-xs text-slate-500">{timestampLabel}</div>
                  </div>

                  <div className="mt-3 text-sm text-slate-800">{description}</div>
                </div>
              );
            })}
          </div>
        )}
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
            id="patientProfileName"
            label="Full Name"
            value={profileForm.name}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <Input
            id="patientProfileEmail"
            label="Email (optional)"
            value={profileForm.email}
            onChange={(event) =>
              setProfileForm((prev) => ({ ...prev, email: event.target.value }))
            }
          />
          <Input
            id="patientProfilePhone"
            label="Phone (optional)"
            value={profileForm.phone}
            onChange={(event) =>
              setProfileForm((prev) => ({ ...prev, phone: event.target.value }))
            }
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

