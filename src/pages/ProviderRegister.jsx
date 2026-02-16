import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import Loader from "../components/Loader";
import { formatApiError, registerProvider } from "../api";

export default function ProviderRegister() {
  const navigate = useNavigate();
  const [hospitalName, setHospitalName] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const validation = useMemo(() => {
    if (!hospitalName.trim()) return "Hospital name is required.";
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress.trim())) {
      return "Enter a valid wallet address.";
    }
    return "";
  }, [hospitalName, walletAddress]);

  async function onSubmit(event) {
    event.preventDefault();
    if (validation) return;

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await registerProvider({
        hospitalName: hospitalName.trim(),
        walletAddress: walletAddress.trim()
      });
      setSuccess("Provider account created. Redirecting to login...");
      setTimeout(() => navigate("/provider/login"), 900);
    } catch (submitError) {
      setError(formatApiError(submitError, "Registration failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md rounded-2xl shadow-soft slide-up" title="Provider Register">
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input
            id="hospitalName"
            label="Hospital Name"
            value={hospitalName}
            onChange={(event) => setHospitalName(event.target.value)}
          />
          <Input
            id="providerWallet"
            label="Wallet Address"
            value={walletAddress}
            onChange={(event) => setWalletAddress(event.target.value)}
          />

          {validation && (hospitalName || walletAddress) ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {validation}
            </div>
          ) : null}
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

          <Button type="submit" className="w-full" disabled={Boolean(validation)} loading={loading}>
            Register
          </Button>
          {loading ? <Loader label="Creating provider account..." /> : null}
        </form>

        <p className="mt-4 text-sm text-slate-500">
          Already registered?{" "}
          <Link to="/provider/login" className="font-medium text-healthcare-blue">
            Login
          </Link>
        </p>
      </Card>
    </div>
  );
}

