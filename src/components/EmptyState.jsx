export default function EmptyState({ title, description }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800" />
      <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h4>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">{description}</p>
    </div>
  );
}
