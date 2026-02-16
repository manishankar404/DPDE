import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import Loader from "../components/Loader";
import { formatApiError, registerPatient } from "../api";

export default function PatientRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", patientId: "", walletAddress: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const formErrors = useMemo(() => {
    const issues = {};
    if (!form.name.trim()) issues.name = "Name is required.";
    if (!form.patientId.trim()) issues.patientId = "Patient ID is required.";
    if (!/^0x[a-fA-F0-9]{40}$/.test(form.walletAddress.trim())) {
      issues.walletAddress = "Enter a valid wallet address.";
    }
    return issues;
  }, [form]);

  const isValid = Object.keys(formErrors).length === 0;

  function onChange(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!isValid) return;

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await registerPatient({
        name: form.name.trim(),
        patientId: form.patientId.trim(),
        walletAddress: form.walletAddress.trim()
      });
      setSuccess("Patient registered successfully. Redirecting to login...");
      setTimeout(() => navigate("/patient/login"), 900);
    } catch (submitError) {
      setError(formatApiError(submitError, "Registration failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md rounded-2xl shadow-soft slide-up" title="Patient Register">
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input
            id="name"
            label="Full Name"
            value={form.name}
            onChange={(event) => onChange("name", event.target.value)}
            error={form.name ? formErrors.name : ""}
          />
          <Input
            id="patientId"
            label="Patient ID"
            value={form.patientId}
            onChange={(event) => onChange("patientId", event.target.value)}
            error={form.patientId ? formErrors.patientId : ""}
          />
          <Input
            id="walletAddress"
            label="Wallet Address"
            value={form.walletAddress}
            onChange={(event) => onChange("walletAddress", event.target.value)}
            error={form.walletAddress ? formErrors.walletAddress : ""}
          />

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {success}
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={!isValid} loading={loading}>
            Register
          </Button>
          {loading ? <Loader label="Creating account..." /> : null}
        </form>

        <p className="mt-4 text-sm text-slate-500">
          Already registered?{" "}
          <Link to="/patient/login" className="font-medium text-healthcare-blue">
            Login
          </Link>
        </p>
      </Card>
    </div>
  );
}

