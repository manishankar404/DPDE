const styles = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  denied: "bg-red-100 text-red-800 border-red-200",
  patient: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900/60",
  provider: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-200 dark:border-teal-900/60",
  uploaded: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-100 dark:border-slate-700",
  unknown: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-100 dark:border-slate-700",
  default: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-100 dark:border-slate-700"
};

export default function StatusBadge({ status = "default" }) {
  const key = String(status || "").toLowerCase();
  return (
    <span
      className={[
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize",
        styles[key] || styles.default
      ].join(" ")}
    >
      {status || "Unknown"}
    </span>
  );
}
