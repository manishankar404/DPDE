import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import Loader from "../components/Loader";
import { formatApiError, getProviderByWallet } from "../api";
import { useAuth } from "../context/AuthContext";

function preloadProviderDashboard() {
  return Promise.all([
    import("../layout/DashboardLayout"),
    import("./ProviderDashboard")
  ]);
}

export default function ProviderLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [walletAddress, setWalletAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const validation = useMemo(() => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress.trim())) {
      return "Enter a valid wallet address.";
    }
    return "";
  }, [walletAddress]);

  async function onSubmit(event) {
    event.preventDefault();
    if (validation) return;

    setLoading(true);
    setError("");
    try {
      const provider = await getProviderByWallet(walletAddress.trim());
      login({
        role: "provider",
        walletAddress: provider.walletAddress,
        hospitalName: provider.hospitalName
      });
      await preloadProviderDashboard();
      navigate("/provider/dashboard");
    } catch (submitError) {
      setError(formatApiError(submitError, "Login failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md rounded-2xl shadow-soft slide-up" title="Provider Login">
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input
            id="providerLoginWallet"
            label="Wallet Address"
            value={walletAddress}
            onChange={(event) => setWalletAddress(event.target.value)}
          />

          {validation && walletAddress ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {validation}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={Boolean(validation)} loading={loading}>
            Login
          </Button>
          {loading ? <Loader label="Signing in..." /> : null}
        </form>

        <p className="mt-4 text-sm text-slate-500">
          New provider?{" "}
          <Link to="/provider/register" className="font-medium text-healthcare-blue">
            Create account
          </Link>
        </p>
      </Card>
    </div>
  );
}
