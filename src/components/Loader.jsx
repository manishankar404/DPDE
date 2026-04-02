export default function Loader({ label = "Loading..." }) {
  return (
    <div className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-healthcare-teal dark:border-slate-600" />
      <span>{label}</span>
    </div>
  );
}

