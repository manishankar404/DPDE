import { useEffect, useMemo, useRef, useState } from "react";
import { formatApiError, getFilesByPatient, registerFile } from "../api";
import { grantAccess, rejectAccessRequest } from "../blockchain/consent";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import Loader from "../components/Loader";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import Toast from "../components/Toast";
import { useAccess } from "../context/AccessContext";
import { useAuth } from "../context/AuthContext";
import { decryptBlob } from "../decrypt";
import { encryptFile } from "../encrypt";
import { uploadToIPFS } from "../upload";

function encodeArray(arr) {
  return btoa(JSON.stringify(arr));
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
  const { user } = useAuth();
  const { pendingRequests, refreshPendingRequests } = useAccess();
  const fileInputRef = useRef(null);
  const objectUrlsRef = useRef([]);

  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [actionLoadingKey, setActionLoadingKey] = useState("");
  const [fileActionLoading, setFileActionLoading] = useState("");
  const [latestCid, setLatestCid] = useState("");
  const [preview, setPreview] = useState({
    open: false,
    url: "",
    type: "",
    name: ""
  });
  const [toasts, setToasts] = useState([]);

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

  function closePreview() {
    if (preview.url) {
      URL.revokeObjectURL(preview.url);
      objectUrlsRef.current = objectUrlsRef.current.filter((item) => item !== preview.url);
    }
    setPreview({ open: false, url: "", type: "", name: "" });
  }

  const metrics = useMemo(
    () => ({
      totalFiles: files.length,
      pendingRequests: pendingRequests.length
    }),
    [files.length, pendingRequests.length]
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

  async function refreshAll() {
    await Promise.all([loadFiles(), refreshPendingRequests(user?.walletAddress)]);
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.patientId, user?.walletAddress]);

  async function uploadFile(file) {
    if (!file || !user?.patientId) return;

    setUploading(true);
    setUploadProgress(10);
    try {
      const encrypted = await encryptFile(file);
      setUploadProgress(35);

      const uploadedCid = await uploadToIPFS(encrypted.encryptedBlob);
      setUploadProgress(60);

      setUploadProgress(80);

      await registerFile({
        cid: uploadedCid,
        patientId: user.patientId,
        fileName: file.name,
        fileType: file.type || "",
        encryptedKey: encodeArray(encrypted.key),
        encryptedIv: encodeArray(encrypted.iv),
        encryptedKeyForProvider: encodeArray(encrypted.key),
        encryptedIvForProvider: encodeArray(encrypted.iv)
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

  function onDrop(event) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) uploadFile(file);
  }

  async function approveProvider(provider) {
    setActionLoadingKey(provider);
    try {
      await grantAccess(provider);
      addToast("Provider access granted.", "success");
      await refreshPendingRequests(user.walletAddress);
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

  async function decryptToObjectUrl(file) {
    const { keyCandidate, ivCandidate } = getEncryptedMaterial(file);
    const key = decodeArray(keyCandidate);
    const iv = decodeArray(ivCandidate);
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
      setPreview({
        open: true,
        url,
        type: mimeType,
        name: file.fileName || "record"
      });
      addToast("File opened in web preview.", "success");
    } catch (error) {
      addToast(formatApiError(error, "Failed to preview file."), "error");
    } finally {
      setFileActionLoading("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <p className="text-sm text-slate-500">Total Files</p>
          <p className="mt-2 text-2xl font-bold text-healthcare-blue">{metrics.totalFiles}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Pending Provider Requests</p>
          <p className="mt-2 text-2xl font-bold text-healthcare-warning">
            {metrics.pendingRequests}
          </p>
        </Card>
      </div>

      <Card title="Upload Files" subtitle="Files are encrypted and can be opened automatically after access approval">
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
          <p className="mb-3 text-sm text-slate-600">Drag and drop a file</p>
          <Button type="button" variant="accent" onClick={() => fileInputRef.current?.click()}>
            Select File
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(event) => uploadFile(event.target.files?.[0])}
          />
        </div>

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

        {latestCid ? (
          <p className="mt-3 text-xs text-slate-600">
            Latest CID: <span className="font-mono">{latestCid}</span>
          </p>
        ) : null}
      </Card>

      <Card title="Provider Access Requests" subtitle="Approve or reject full patient-record access">
        {pendingRequests.length === 0 ? (
          <EmptyState
            title="No pending provider requests"
            description="New access requests will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2">Provider Address</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((provider) => {
                  const isBusy = actionLoadingKey === provider;
                  return (
                    <tr key={provider} className="border-b border-slate-100">
                      <td className="py-3 font-mono text-xs">{provider}</td>
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
        )}
      </Card>

      <Card title="File History">
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
              const hasKeyMaterial = Boolean(keyCandidate && ivCandidate);
              return (
                <div
                  key={file._id || `${file.cid}_${file.uploadedAt}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="text-sm font-semibold text-slate-800">{file.fileName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {file.fileType || "Unknown type"}
                  </p>
                  <p className="mt-2 font-mono text-xs text-slate-600">{file.cid}</p>
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

      <Modal
        open={preview.open}
        title={`Preview: ${preview.name}`}
        onClose={closePreview}
      >
        {preview.type.startsWith("image/") ? (
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
