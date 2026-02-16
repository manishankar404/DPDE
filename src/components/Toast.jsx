import { useEffect } from "react";

const toneClasses = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-slate-200 bg-white text-slate-700"
};

export default function Toast({ toast, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(toast.id), 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  return (
    <div
      className={[
        "rounded-xl border px-4 py-3 text-sm shadow-soft slide-up",
        toneClasses[toast.tone || "info"]
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-4">
        <span>{toast.message}</span>
        <button
          type="button"
          onClick={() => onClose(toast.id)}
          className="text-xs font-semibold"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

