const styles = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  denied: "bg-red-100 text-red-800 border-red-200",
  patient: "bg-blue-100 text-blue-800 border-blue-200",
  provider: "bg-teal-100 text-teal-800 border-teal-200",
  uploaded: "bg-slate-100 text-slate-700 border-slate-200",
  unknown: "bg-slate-100 text-slate-700 border-slate-200",
  default: "bg-slate-100 text-slate-700 border-slate-200"
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
