import { useEffect, useMemo, useRef, useState } from "react";
import { formatApiError, getFilesByPatient, getPatientById } from "../api";
import {
  checkMyAccess,
  getCurrentWalletAddress,
  requestPatientAccess
} from "../blockchain/consent";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import Input from "../components/Input";
import Loader from "../components/Loader";
import StatusBadge from "../components/StatusBadge";
import Toast from "../components/Toast";
import { useAccess } from "../context/AccessContext";
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
  const { patientAccessStatus, refreshAccessStatus } = useAccess();
  const [patientId, setPatientId] = useState("");
  const [patientIdError, setPatientIdError] = useState("");
  const [patientAddress, setPatientAddress] = useState("");
  const [files, setFiles] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [toasts, setToasts] = useState([]);
  const objectUrlsRef = useRef([]);

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
      const [patient, fileList] = await Promise.all([
        getPatientById(patientId.trim()),
        getFilesByPatient(patientId.trim())
      ]);

      setPatientAddress(patient.walletAddress);
      setFiles(Array.isArray(fileList) ? fileList : []);
      const status = await refreshAccessStatus(patient.walletAddress);
      if (!status) {
        addToast(
          "Patient files loaded, but blockchain access status is unavailable. Redeploy/update ConsentManager if needed.",
          "warning"
        );
      }
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

  async function openFile(file) {
    if (!patientAddress) return;
    setActionLoading(`open_${file.cid}`);
    try {
      const providerAddress = await getCurrentWalletAddress();
      const allowed = await checkMyAccess(patientAddress);
      if (!allowed) {
        await refreshAccessStatus(patientAddress);
        addToast("Access is not approved for this patient.", "error");
        return;
      }

      const { keyCandidate, ivCandidate } = getEncryptedMaterial(file);
      const key = decodeArray(keyCandidate);
      const iv = decodeArray(ivCandidate);
      if (!key.length || !iv.length) {
        throw new Error("Missing encrypted key material for file.");
      }

      const response = await fetchIpfsWithFallback(file.cid);
      const encryptedBlob = await response.blob();
      const decryptedBlob = await decryptBlob(encryptedBlob, key, iv);

      const url = URL.createObjectURL(decryptedBlob);
      objectUrlsRef.current.push(url);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.fileName || "record";
      document.body.appendChild(link);
      link.click();
      link.remove();

      addToast(`Opened file as ${providerAddress.slice(0, 6)}...`, "success");
    } catch (error) {
      addToast(formatApiError(error, "Failed to open file."), "error");
    } finally {
      setActionLoading("");
    }
  }

  return (
    <div className="space-y-6">
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
            <p className="text-sm text-slate-600">
              Patient wallet: <span className="font-mono text-xs">{patientAddress}</span>
            </p>
            <StatusBadge status={patientAccessStatus || "unknown"} />
            <span className="text-xs text-slate-600">{accessBadge}</span>
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
          ) : null}
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
              const loading = actionLoading === `open_${file.cid}`;
              const { keyCandidate, ivCandidate } = getEncryptedMaterial(file);
              const hasKeyMaterial = Boolean(keyCandidate && ivCandidate);
              return (
                <div
                  key={file._id || file.cid}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="text-sm font-semibold text-slate-800">{file.fileName}</p>
                  <p className="mt-1 text-xs text-slate-500">{file.fileType || "Unknown type"}</p>
                  <p className="mt-2 font-mono text-xs text-slate-600">{file.cid}</p>
                  {!hasKeyMaterial ? (
                    <p className="mt-2 text-xs text-amber-700">
                      This file was uploaded before auto-decryption metadata was enabled.
                      Patient must re-upload this file.
                    </p>
                  ) : null}
                  <div className="mt-3">
                    <Button
                      type="button"
                      loading={loading}
                      disabled={patientAccessStatus !== "approved" || !hasKeyMaterial}
                      onClick={() => openFile(file)}
                    >
                      Open File
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="fixed right-4 top-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={removeToast} />
        ))}
      </div>
    </div>
  );
}
