import { useEffect, useMemo, useRef, useState } from "react";
import { formatApiError, getFilesByPatient, registerFile } from "../api";
import { grantAccess, rejectAccessRequest } from "../blockchain/consent";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import Loader from "../components/Loader";
import StatusBadge from "../components/StatusBadge";
import Toast from "../components/Toast";
import { useAccess } from "../context/AccessContext";
import { useAuth } from "../context/AuthContext";
import { encryptFile } from "../encrypt";
import { uploadToIPFS } from "../upload";

function encodeArray(arr) {
  return btoa(JSON.stringify(arr));
}

export default function PatientDashboard() {
  const { user } = useAuth();
  const { pendingRequests, refreshPendingRequests } = useAccess();
  const fileInputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [actionLoadingKey, setActionLoadingKey] = useState("");
  const [latestCid, setLatestCid] = useState("");
  const [toasts, setToasts] = useState([]);

  function addToast(message, tone = "info") {
    setToasts((prev) => [...prev, { id: `${Date.now()}_${Math.random()}`, message, tone }]);
  }

  function removeToast(id) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
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
          <div className="space-y-3">
            {files.map((file) => (
              <div
                key={file._id || `${file.cid}_${file.uploadedAt}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">{file.fileName}</p>
                  <p className="text-xs text-slate-500">{file.fileType || "Unknown type"}</p>
                </div>
                <p className="font-mono text-xs text-slate-600">{file.cid}</p>
              </div>
            ))}
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
