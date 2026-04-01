import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatApiError, getPatientAuditLogs } from "../api";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import Input from "../components/Input";
import Loader from "../components/Loader";
import { useAuth } from "../context/AuthContext";
import { formatActionLog } from "../utils/formatters";

const ACTION_BADGE_STYLES = {
  UPLOAD: "bg-blue-100 text-blue-800 border-blue-200",
  REQUEST_ACCESS: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVE: "bg-green-100 text-green-800 border-green-200",
  REJECT: "bg-red-100 text-red-800 border-red-200",
  REVOKE: "bg-orange-100 text-orange-800 border-orange-200",
  VIEW_FILE: "bg-purple-100 text-purple-800 border-purple-200",
  DOWNLOAD_FILE: "bg-teal-100 text-teal-800 border-teal-200",
  PRINT_FILE: "bg-sky-100 text-sky-800 border-sky-200",
  DEFAULT: "bg-slate-100 text-slate-700 border-slate-200"
};

const ACCESS_TABLE_ACTIONS = ["REQUEST_ACCESS", "APPROVE", "REJECT", "REVOKE"];
const ACCESS_REQUEST_ONLY_ACTIONS = ["REQUEST_ACCESS"];
const ACCESS_DECISION_ACTIONS = ["APPROVE", "REJECT", "REVOKE"];
const FILE_TABLE_ACTIONS = ["UPLOAD", "VIEW_FILE", "DOWNLOAD_FILE", "PRINT_FILE"];
const FILE_ACCESS_ACTIONS = ["VIEW_FILE", "DOWNLOAD_FILE", "PRINT_FILE"];
const UPLOAD_ACTIONS = ["UPLOAD"];

function normalizeText(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTimestamp(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function formatCid(value) {
  const cidValue = normalizeText(value);
  if (!cidValue) return "—";
  if (cidValue.length <= 18) return cidValue;
  return `${cidValue.slice(0, 10)}…${cidValue.slice(-6)}`;
}

export default function PatientAuditLogs() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);

  const [logGroup, setLogGroup] = useState("all");
  const [action, setAction] = useState("all");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("timestamp");
  const [sortDir, setSortDir] = useState("desc");
  const [pageSize, setPageSize] = useState(10);
  const [accessPage, setAccessPage] = useState(1);
  const [filePage, setFilePage] = useState(1);

  const patientLabel = useMemo(() => normalizeText(user?.name) || "Patient", [user?.name]);

  useEffect(() => {
    let active = true;
    const wallet = user?.walletAddress;
    if (!wallet) return undefined;

    setLoading(true);
    setError("");
    getPatientAuditLogs(wallet, { limit: 1000 })
      .then((list) => {
        if (!active) return;
        setLogs(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        if (!active) return;
        setError(formatApiError(err, "Failed to load activity history."));
        setLogs([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.walletAddress]);

  const groupScopedLogs = useMemo(() => {
    if (!Array.isArray(logs)) return [];
    return logs.filter((log) => {
      const logAction = normalizeText(log?.action);
      if (logGroup === "access") return ACCESS_TABLE_ACTIONS.includes(logAction);
      if (logGroup === "access_requests") return ACCESS_REQUEST_ONLY_ACTIONS.includes(logAction);
      if (logGroup === "access_decisions") return ACCESS_DECISION_ACTIONS.includes(logAction);
      if (logGroup === "file") return FILE_TABLE_ACTIONS.includes(logAction);
      if (logGroup === "file_access") return FILE_ACCESS_ACTIONS.includes(logAction);
      if (logGroup === "uploads") return UPLOAD_ACTIONS.includes(logAction);
      return true;
    });
  }, [logGroup, logs]);

  const actions = useMemo(() => {
    const list = Array.from(
      new Set((Array.isArray(groupScopedLogs) ? groupScopedLogs : []).map((log) => normalizeText(log?.action)))
    ).filter(Boolean);
    list.sort((a, b) => a.localeCompare(b));
    return list;
  }, [groupScopedLogs]);

  const filteredLogs = useMemo(() => {
    if (!Array.isArray(groupScopedLogs)) return [];

    const needle = query.trim().toLowerCase();

    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

    const fullFiltered = groupScopedLogs.filter((log) => {
      const logAction = normalizeText(log?.action);
      if (action !== "all" && logAction !== action) return false;

      const tsRaw = log?.timestamp || log?.createdAt || null;
      const ts = tsRaw ? new Date(tsRaw).getTime() : 0;
      if (fromTs && Number.isFinite(fromTs) && ts && ts < fromTs) return false;
      if (toTs && Number.isFinite(toTs) && ts && ts > toTs) return false;

      const providerDisplay = normalizeText(log?.providerDisplay || log?.providerName);
      const providerWallet = normalizeText(log?.providerWallet);
      const cid = normalizeText(log?.cid).toLowerCase();
      const fileName = normalizeText(log?.fileName).toLowerCase();

      if (needle) {
        const description = String(formatActionLog(log) || "").toLowerCase();
        const base = [
          logAction,
          providerDisplay,
          providerWallet,
          cid,
          fileName,
          description
        ]
          .join(" ")
          .toLowerCase();
        if (!base.includes(needle)) return false;
      }

      return true;
    });

    const sorted = [...fullFiltered].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const aTs = a?.timestamp || a?.createdAt || 0;
      const bTs = b?.timestamp || b?.createdAt || 0;

      const aProvider = normalizeText(a?.providerDisplay || a?.providerName || a?.providerWallet).toLowerCase();
      const bProvider = normalizeText(b?.providerDisplay || b?.providerName || b?.providerWallet).toLowerCase();

      const aFile = normalizeText(a?.fileName).toLowerCase();
      const bFile = normalizeText(b?.fileName).toLowerCase();

      const aAction = normalizeText(a?.action).toLowerCase();
      const bAction = normalizeText(b?.action).toLowerCase();

      if (sortBy === "action") return dir * aAction.localeCompare(bAction);
      if (sortBy === "provider") return dir * aProvider.localeCompare(bProvider);
      if (sortBy === "file") return dir * aFile.localeCompare(bFile);

      return dir * (new Date(aTs).getTime() - new Date(bTs).getTime());
    });

    return sorted;
  }, [
    action,
    dateFrom,
    dateTo,
    groupScopedLogs,
    query,
    sortBy,
    sortDir
  ]);

  useEffect(() => {
    setAccessPage(1);
    setFilePage(1);
  }, [
    action,
    dateFrom,
    dateTo,
    logGroup,
    query,
    pageSize,
    sortBy,
    sortDir
  ]);

  const accessLogs = useMemo(
    () => filteredLogs.filter((log) => ACCESS_TABLE_ACTIONS.includes(normalizeText(log?.action))),
    [filteredLogs]
  );
  const fileLogs = useMemo(
    () => filteredLogs.filter((log) => FILE_TABLE_ACTIONS.includes(normalizeText(log?.action))),
    [filteredLogs]
  );

  const accessTotal = accessLogs.length;
  const fileTotal = fileLogs.length;

  const accessTotalPages = Math.max(1, Math.ceil(accessTotal / pageSize));
  const fileTotalPages = Math.max(1, Math.ceil(fileTotal / pageSize));

  const safeAccessPage = Math.min(Math.max(1, accessPage), accessTotalPages);
  const safeFilePage = Math.min(Math.max(1, filePage), fileTotalPages);

  const paginatedAccessLogs = useMemo(() => {
    const start = (safeAccessPage - 1) * pageSize;
    return accessLogs.slice(start, start + pageSize);
  }, [accessLogs, pageSize, safeAccessPage]);

  const paginatedFileLogs = useMemo(() => {
    const start = (safeFilePage - 1) * pageSize;
    return fileLogs.slice(start, start + pageSize);
  }, [fileLogs, pageSize, safeFilePage]);

  function clearFilters() {
    setLogGroup("all");
    setAction("all");
    setQuery("");
    setDateFrom("");
    setDateTo("");
    setSortBy("timestamp");
    setSortDir("desc");
    setPageSize(10);
    setAccessPage(1);
    setFilePage(1);
  }

  function exportCsv() {
    const rows = filteredLogs.map((log) => {
      const tsRaw = log?.timestamp || log?.createdAt || "";
      const time = tsRaw ? new Date(tsRaw).toISOString() : "";
      const actionValue = String(log?.action || "");
      const provider = String(log?.providerDisplay || log?.providerName || log?.providerWallet || "");
      const fileName = String(log?.fileName || "");
      const cid = String(log?.cid || "");
      const details = String(formatActionLog(log) || "");
      return [actionValue, provider, fileName, cid, details, time]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(",");
    });

    const header = ["action", "provider", "fileName", "cid", "details", "time"].join(",");
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `dpde_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadPdf() {
    if (filteredLogs.length === 0) return;
    setExportingPdf(true);

    try {
      const accessRowsHtml = accessLogs
        .map((log) => {
          const actionValue = escapeHtml(log.action || "UNKNOWN");
          const providerDisplay = escapeHtml(
            normalizeText(log?.providerDisplay || log?.providerName) ||
              normalizeText(log?.providerWallet) ||
              "—"
          );
          const details = escapeHtml(formatActionLog(log) || "");
          const time = escapeHtml(formatTimestamp(log?.timestamp || log?.createdAt));

          return `
            <tr>
              <td><span class="badge badge-${actionValue}">${actionValue}</span></td>
              <td>${providerDisplay}</td>
              <td>${details}</td>
              <td>${time}</td>
            </tr>
          `;
        })
        .join("");

      const fileRowsHtml = fileLogs
        .map((log) => {
          const actionValue = escapeHtml(log.action || "UNKNOWN");
          const role = normalizeText(log?.role);
          const actorLabel =
            role === "patient"
              ? `${patientLabel} (you)`
              : normalizeText(log?.providerDisplay || log?.providerName) ||
                normalizeText(log?.providerWallet) ||
                "—";
          const actionBy = escapeHtml(actorLabel);
          const fileName = escapeHtml(normalizeText(log?.fileName) || "—");
          const cidLabel = escapeHtml(normalizeText(log?.cid) || "—");
          const details = escapeHtml(formatActionLog(log) || "");
          const time = escapeHtml(formatTimestamp(log?.timestamp || log?.createdAt));

          return `
            <tr>
              <td><span class="badge badge-${actionValue}">${actionValue}</span></td>
              <td>${actionBy}</td>
              <td>${fileName}</td>
              <td class="mono">${cidLabel}</td>
              <td>${details}</td>
              <td>${time}</td>
            </tr>
          `;
        })
        .join("");

      const html = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>DPDE Audit Logs</title>
            <style>
              @page { size: A4; margin: 14mm; }
              body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color: #0f172a; }
              h1 { font-size: 16px; margin: 0 0 6px; }
              h2 { font-size: 13px; margin: 18px 0 8px; }
              p { margin: 0 0 10px; font-size: 12px; color: #475569; }
              table { width: 100%; border-collapse: collapse; font-size: 11px; }
              th, td { border: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; }
              th { background: #f8fafc; text-align: left; }
              .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
              .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; border: 1px solid #e2e8f0; font-weight: 600; font-size: 10px; }
              .badge-UPLOAD { background: #dbeafe; border-color: #bfdbfe; color: #1e40af; }
              .badge-REQUEST_ACCESS { background: #fef3c7; border-color: #fde68a; color: #92400e; }
              .badge-APPROVE { background: #dcfce7; border-color: #bbf7d0; color: #166534; }
              .badge-REJECT { background: #fee2e2; border-color: #fecaca; color: #991b1b; }
              .badge-REVOKE { background: #ffedd5; border-color: #fed7aa; color: #9a3412; }
              .badge-VIEW_FILE { background: #ede9fe; border-color: #ddd6fe; color: #5b21b6; }
              .badge-DOWNLOAD_FILE { background: #ccfbf1; border-color: #99f6e4; color: #115e59; }
              .badge-PRINT_FILE { background: #e0f2fe; border-color: #bae6fd; color: #075985; }
              .badge-UNKNOWN { background: #f1f5f9; border-color: #e2e8f0; color: #334155; }
              @media print { tr { page-break-inside: avoid; } }
            </style>
          </head>
          <body>
            <h1>Audit Logs</h1>
            <p>
              Account: ${escapeHtml(normalizeText(user?.walletAddress) || "—")} • Generated: ${escapeHtml(
                new Date().toLocaleString()
              )} • Records: ${escapeHtml(filteredLogs.length)}
            </p>

            <h2>Access Requests</h2>
            <table>
              <thead>
                <tr>
                  <th style="width: 14%;">Action</th>
                  <th style="width: 18%;">Provider</th>
                  <th>Details</th>
                  <th style="width: 18%;">Time</th>
                </tr>
              </thead>
              <tbody>${accessRowsHtml || `<tr><td colspan="4">No access-request activity in this view.</td></tr>`}</tbody>
            </table>

            <h2>File Activity</h2>
            <table>
              <thead>
                <tr>
                  <th style="width: 12%;">Action</th>
                  <th style="width: 16%;">Action by</th>
                  <th style="width: 18%;">File</th>
                  <th style="width: 18%;">CID</th>
                  <th>Details</th>
                  <th style="width: 16%;">Time</th>
                </tr>
              </thead>
              <tbody>${fileRowsHtml || `<tr><td colspan="6">No file activity in this view.</td></tr>`}</tbody>
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
          setTimeout(cleanup, 1000);
        }
      };

      frameWindow.onafterprint = cleanup;
      iframe.onload = triggerPrint;
      setTimeout(triggerPrint, 600);
    } catch (err) {
      setError(formatApiError(err, "Failed to export PDF."));
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <Card title="Audit Logs" subtitle="Complete activity history for this account.">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate("/patient/dashboard")}>
            Back
          </Button>
          <div className="text-xs text-slate-500">
            Showing <span className="font-semibold text-slate-700">{filteredLogs.length}</span>{" "}
            {filteredLogs.length === 1 ? "log" : "logs"}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" disabled={filteredLogs.length === 0} onClick={exportCsv}>
            Export CSV
          </Button>
          <Button
            type="button"
            variant="ghost"
            loading={exportingPdf}
            disabled={filteredLogs.length === 0 || exportingPdf}
            onClick={downloadPdf}
          >
            Download PDF
          </Button>
          <Button type="button" variant="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      </div>

      <div className="mb-4 space-y-3">
        <Input
          id="auditSearch"
          label="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="w-full min-w-0">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Group</label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              value={logGroup}
              onChange={(event) => setLogGroup(event.target.value)}
            >
              <option value="all">All</option>
              <option value="access">Access requests (all)</option>
              <option value="access_requests">Access requests (requested)</option>
              <option value="access_decisions">Access requests (decisions)</option>
              <option value="file">File activity (all)</option>
              <option value="file_access">File activity (views/downloads/prints)</option>
              <option value="uploads">File activity (uploads)</option>
            </select>
          </div>

          <div className="w-full min-w-0">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Action</label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              value={action}
              onChange={(event) => setAction(event.target.value)}
            >
              <option value="all">All</option>
              {actions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-3 lg:col-span-2">
            <Input
              id="auditFrom"
              label="From"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <Input
              id="auditTo"
              label="To"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>

          <div className="w-full min-w-0">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Sort by</label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              <option value="timestamp">Timestamp</option>
              <option value="action">Action</option>
              <option value="provider">Actor</option>
              <option value="file">File</option>
            </select>
          </div>

          <div className="w-full min-w-0">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Direction</label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              value={sortDir}
              onChange={(event) => setSortDir(event.target.value)}
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>

          <div className="w-full min-w-0">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Rows</label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value) || 25)}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <Loader label="Loading activity history..." />
      ) : filteredLogs.length === 0 ? (
        <EmptyState title="No activity yet" description="Your activity will show up here." />
      ) : (
        <>
          <div className="grid gap-6">
            {(logGroup === "all" ||
              logGroup === "access" ||
              logGroup === "access_requests" ||
              logGroup === "access_decisions") ? (
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">
                  Access Requests{" "}
                  <span className="text-xs font-medium text-slate-500">({accessTotal})</span>
                </div>
                <div className="text-xs text-slate-500">
                  Page <span className="font-semibold text-slate-700">{safeAccessPage}</span> of{" "}
                  <span className="font-semibold text-slate-700">{accessTotalPages}</span>
                </div>
              </div>

              {accessTotal === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-950/30 dark:text-slate-300">
                  No access-request activity matches your filters.
                </div>
              ) : (
                <>
                  <div className="grid gap-3 md:hidden">
                    {paginatedAccessLogs.map((log) => {
                      const badgeStyle =
                        ACTION_BADGE_STYLES[log.action] || ACTION_BADGE_STYLES.DEFAULT;
                      const timestampLabel = formatTimestamp(log?.timestamp || log?.createdAt);
                      const providerDisplay =
                        normalizeText(log?.providerDisplay || log?.providerName) ||
                        normalizeText(log?.providerWallet) ||
                        "—";
                      const description = formatActionLog(log);

                      return (
                        <div
                          key={
                            log._id ||
                            `${log.action}_${log.timestamp}_${log.cid || ""}_${log.providerWallet || ""}`
                          }
                          className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-950/30"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
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

                          <div className="mt-3 text-sm text-slate-800 dark:text-slate-100">{description}</div>
                          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            Provider: <span className="font-medium text-slate-700 dark:text-slate-200">{providerDisplay}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block dark:border-slate-600 dark:bg-slate-950/30">
                    <table className="w-full table-fixed text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        <tr>
                          <th className="whitespace-nowrap px-4 py-3">Action</th>
                          <th className="whitespace-nowrap px-4 py-3">Provider</th>
                          <th className="px-4 py-3">Details</th>
                          <th className="whitespace-nowrap px-4 py-3">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {paginatedAccessLogs.map((log) => {
                          const badgeStyle =
                            ACTION_BADGE_STYLES[log.action] || ACTION_BADGE_STYLES.DEFAULT;
                          const timestampLabel = formatTimestamp(log?.timestamp || log?.createdAt);
                          const providerDisplay =
                            normalizeText(log?.providerDisplay || log?.providerName) ||
                            normalizeText(log?.providerWallet) ||
                            "—";
                          const description = formatActionLog(log);

                          return (
                            <tr
                              key={
                                log._id ||
                                `${log.action}_${log.timestamp}_${log.cid || ""}_${log.providerWallet || ""}`
                              }
                              className="hover:bg-slate-50 dark:hover:bg-slate-900/60"
                            >
                              <td className="whitespace-nowrap px-4 py-3">
                                <span
                                  className={[
                                    "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                                    badgeStyle
                                  ].join(" ")}
                                >
                                  {log.action || "UNKNOWN"}
                                </span>
                              </td>
                              <td className="max-w-[220px] truncate px-4 py-3 text-slate-800 dark:text-slate-100">
                                {providerDisplay}
                              </td>
                              <td className="px-4 py-3 text-slate-800 dark:text-slate-100">{description}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                                {timestampLabel}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={safeAccessPage <= 1}
                      onClick={() => setAccessPage((value) => Math.max(1, value - 1))}
                    >
                      Prev
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={safeAccessPage >= accessTotalPages}
                      onClick={() =>
                        setAccessPage((value) => Math.min(accessTotalPages, value + 1))
                      }
                    >
                      Next
                    </Button>
                  </div>
                </>
              )}
            </section>
            ) : null}

            {(logGroup === "all" ||
              logGroup === "file" ||
              logGroup === "file_access" ||
              logGroup === "uploads") ? (
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">
                  File Activity{" "}
                  <span className="text-xs font-medium text-slate-500">({fileTotal})</span>
                </div>
                <div className="text-xs text-slate-500">
                  Page <span className="font-semibold text-slate-700">{safeFilePage}</span> of{" "}
                  <span className="font-semibold text-slate-700">{fileTotalPages}</span>
                </div>
              </div>

              {fileTotal === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-950/30 dark:text-slate-300">
                  No file activity matches your filters.
                </div>
              ) : (
                <>
                  <div className="grid gap-3 md:hidden">
                    {paginatedFileLogs.map((log) => {
                      const badgeStyle =
                        ACTION_BADGE_STYLES[log.action] || ACTION_BADGE_STYLES.DEFAULT;
                      const timestampLabel = formatTimestamp(log?.timestamp || log?.createdAt);
                      const role = normalizeText(log?.role);
                      const actorLabel =
                        role === "patient"
                          ? `${patientLabel} (you)`
                          : normalizeText(log?.providerDisplay || log?.providerName) ||
                            normalizeText(log?.providerWallet) ||
                            "—";
                      const cidLabel = formatCid(log?.cid);
                      const fileName = normalizeText(log?.fileName) || "—";
                      const description = formatActionLog(log);

                      return (
                        <div
                          key={
                            log._id ||
                            `${log.action}_${log.timestamp}_${log.cid || ""}_${log.providerWallet || ""}`
                          }
                          className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-950/30"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
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

                          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            Action by: <span className="font-medium text-slate-700 dark:text-slate-200">{actorLabel}</span>
                          </div>
                          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            File: <span className="font-medium text-slate-700 dark:text-slate-200">{fileName}</span>
                          </div>
                          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            CID: <span className="font-mono text-slate-700 dark:text-slate-200">{cidLabel}</span>
                          </div>
                          <div className="mt-3 text-sm text-slate-800 dark:text-slate-100">{description}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block dark:border-slate-600 dark:bg-slate-950/30">
                    <table className="w-full table-fixed text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        <tr>
                          <th className="whitespace-nowrap px-4 py-3">Action</th>
                          <th className="whitespace-nowrap px-4 py-3">Action by</th>
                          <th className="whitespace-nowrap px-4 py-3">File</th>
                          <th className="whitespace-nowrap px-4 py-3">CID</th>
                          <th className="px-4 py-3">Details</th>
                          <th className="whitespace-nowrap px-4 py-3">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {paginatedFileLogs.map((log) => {
                          const badgeStyle =
                            ACTION_BADGE_STYLES[log.action] || ACTION_BADGE_STYLES.DEFAULT;
                          const timestampLabel = formatTimestamp(log?.timestamp || log?.createdAt);
                          const role = normalizeText(log?.role);
                          const actorLabel =
                            role === "patient"
                              ? `${patientLabel} (you)`
                              : normalizeText(log?.providerDisplay || log?.providerName) ||
                                normalizeText(log?.providerWallet) ||
                                "—";
                          const cidLabel = formatCid(log?.cid);
                          const fileName = normalizeText(log?.fileName) || "—";
                          const description = formatActionLog(log);

                          return (
                            <tr
                              key={
                                log._id ||
                                `${log.action}_${log.timestamp}_${log.cid || ""}_${log.providerWallet || ""}`
                              }
                              className="hover:bg-slate-50 dark:hover:bg-slate-900/60"
                            >
                              <td className="whitespace-nowrap px-4 py-3">
                                <span
                                  className={[
                                    "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                                    badgeStyle
                                  ].join(" ")}
                                >
                                  {log.action || "UNKNOWN"}
                                </span>
                              </td>
                              <td className="max-w-[220px] truncate px-4 py-3 text-slate-800 dark:text-slate-100">
                                {actorLabel}
                              </td>
                              <td className="max-w-[220px] truncate px-4 py-3 text-slate-800 dark:text-slate-100">
                                {fileName}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                                {cidLabel}
                              </td>
                              <td className="px-4 py-3 text-slate-800 dark:text-slate-100">{description}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                                {timestampLabel}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={safeFilePage <= 1}
                      onClick={() => setFilePage((value) => Math.max(1, value - 1))}
                    >
                      Prev
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={safeFilePage >= fileTotalPages}
                      onClick={() => setFilePage((value) => Math.min(fileTotalPages, value + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </>
              )}
            </section>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}
