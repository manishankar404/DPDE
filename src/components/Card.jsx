export default function Card({ title, subtitle, headerRight = null, children, className = "" }) {
  return (
    <section
      className={[
        "rounded-2xl border border-slate-200 bg-white p-5 shadow-soft fade-in",
        "dark:border-slate-600 dark:bg-slate-900/70",
        className
      ].join(" ")}
    >
      {title || headerRight ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          {title ? (
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h3>
          ) : (
            <span />
          )}
          {headerRight}
        </div>
      ) : null}
      {subtitle ? (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">{subtitle}</p>
      ) : null}
      <div className={title || subtitle ? "mt-4" : ""}>{children}</div>
    </section>
  );
}
