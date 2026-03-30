import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatApiError, getPatientAuditLogs } from "../api";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
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

export default function PatientAuditLogs() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logFilter, setLogFilter] = useState("all");

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

  const filteredLogs = useMemo(() => {
    if (!Array.isArray(logs)) return [];
    if (logFilter === "uploads") return logs.filter((log) => log.action === "UPLOAD");
    if (logFilter === "requests") return logs.filter((log) => log.action === "REQUEST_ACCESS");
    if (logFilter === "approvals")
      return logs.filter((log) => ["APPROVE", "REJECT", "REVOKE"].includes(log.action));
    if (logFilter === "file")
      return logs.filter((log) =>
        ["VIEW_FILE", "DOWNLOAD_FILE", "PRINT_FILE"].includes(log.action)
      );
    return logs;
  }, [logs, logFilter]);

  return (
    <Card title="Audit Logs" subtitle="Complete activity history for this account.">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={() => navigate("/patient/dashboard")}>
          Back
        </Button>
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
        <div className="grid gap-3">
          {filteredLogs.map((log) => {
            const badgeStyle = ACTION_BADGE_STYLES[log.action] || ACTION_BADGE_STYLES.DEFAULT;
            const timestampLabel = log.timestamp ? new Date(log.timestamp).toLocaleString() : "";
            const description = formatActionLog(log);

            return (
              <div
                key={
                  log._id ||
                  `${log.action}_${log.timestamp}_${log.cid || ""}_${log.providerWallet || ""}`
                }
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
  );
}

