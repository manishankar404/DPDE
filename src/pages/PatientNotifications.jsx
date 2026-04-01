import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatApiError, getMyNotificationSettings, updateMyNotificationSettings } from "../api";
import Card from "../components/Card";
import Loader from "../components/Loader";
import { useAuth } from "../context/AuthContext";

export default function PatientNotifications() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getMyNotificationSettings()
      .then((payload) => {
        if (!active) return;
        setEnabled(Boolean(payload?.enabled));
      })
      .catch((err) => {
        if (!active) return;
        setError(formatApiError(err, "Failed to load notification settings."));
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function onToggle(nextEnabled) {
    setSaving(true);
    setError("");
    try {
      const payload = await updateMyNotificationSettings(nextEnabled);
      setEnabled(Boolean(payload?.enabled));
    } catch (err) {
      setError(formatApiError(err, "Failed to update notification settings."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Notifications" subtitle="Email alerts for new access requests.">
      {loading ? <Loader label="Loading settings..." /> : null}
      {error ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-950/30">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Access request emails</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Sends an email when a provider requests access to one of your records.
            </div>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5 accent-healthcare-blue"
            checked={enabled}
            disabled={loading || saving}
            onChange={(event) => onToggle(event.target.checked)}
          />
        </label>

        {!user?.email ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
            Add an email address in your profile to receive notifications.{" "}
            <Link to="/patient/dashboard" className="font-semibold underline">
              Go to dashboard
            </Link>
            .
          </div>
        ) : null}

        {saving ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Saving...
          </div>
        ) : null}
      </div>
    </Card>
  );
}
