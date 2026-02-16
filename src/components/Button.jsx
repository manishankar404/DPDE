const variants = {
  primary: "bg-healthcare-blue text-white hover:bg-blue-800",
  accent: "bg-healthcare-teal text-white hover:bg-teal-700",
  success: "bg-healthcare-success text-white hover:bg-green-700",
  warning: "bg-healthcare-warning text-white hover:bg-amber-700",
  danger: "bg-healthcare-error text-white hover:bg-red-700",
  ghost: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
};

export default function Button({
  children,
  variant = "primary",
  className = "",
  loading = false,
  disabled = false,
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      className={[
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold",
        "transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className
      ].join(" ")}
      disabled={isDisabled}
      {...props}
    >
      {loading ? "Please wait..." : children}
    </button>
  );
}

