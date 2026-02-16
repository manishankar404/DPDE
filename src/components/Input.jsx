export default function Input({
  id,
  label,
  error,
  className = "",
  containerClassName = "",
  ...props
}) {
  return (
    <div className={`w-full ${containerClassName}`}>
      <div className="relative">
        <input
          id={id}
          placeholder=" "
          className={[
            "peer w-full rounded-xl border border-slate-300 bg-white px-3 pt-5 pb-2 text-sm",
            "outline-none transition focus:border-healthcare-teal focus:ring-2 focus:ring-teal-100",
            error ? "border-healthcare-error focus:border-healthcare-error" : "",
            className
          ].join(" ")}
          {...props}
        />
        {label ? (
          <label
            htmlFor={id}
            className="pointer-events-none absolute left-3 top-3 origin-[0] -translate-y-2 scale-75 text-xs text-slate-500 transition-all peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-2 peer-focus:scale-75"
          >
            {label}
          </label>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-xs text-healthcare-error">{error}</p> : null}
    </div>
  );
}

