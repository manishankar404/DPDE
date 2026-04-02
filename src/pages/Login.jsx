import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import Loader from "../components/Loader";
import {
  formatApiError,
  getMyPatientProfile,
  getMyProviderProfile,
  requestNonce,
  verifySignature
} from "../api";
import { ensureSepolia } from "../blockchain/consent";
import { useAuth } from "../context/AuthContext";

function preloadPatientDashboard() {
  return Promise.all([
    import("../layout/DashboardLayout"),
    import("./PatientDashboard")
  ]);
}

function preloadProviderDashboard() {
  return Promise.all([
    import("../layout/DashboardLayout"),
    import("./ProviderDashboard")
  ]);
}

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [walletAddress, setWalletAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const validation = useMemo(() => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress.trim())) return "Connect a wallet.";
    return "";
  }, [walletAddress]);

  async function connectWallet() {
    setConnecting(true);
    setError("");
    try {
      await ensureSepolia();
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address);
    } catch (connectError) {
      setError(formatApiError(connectError, "Failed to connect wallet."));
    } finally {
      setConnecting(false);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (validation) return;

    setLoading(true);
    setError("");
    try {
      await ensureSepolia();
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      await web3Provider.send("eth_requestAccounts", []);
      const signer = await web3Provider.getSigner();
      const address = await signer.getAddress();
      if (address.toLowerCase() !== walletAddress.trim().toLowerCase()) {
        setError("Connected wallet address changed. Please reconnect.");
        return;
      }

      const { nonce } = await requestNonce(address);
      const signature = await signer.signMessage(nonce);
      const { token, role } = await verifySignature({ walletAddress: address, signature });

      login({ role, walletAddress: address }, token);

      if (role === "patient") {
        const patient = await getMyPatientProfile();
        login(
          {
            role: "patient",
            patientId: patient.patientId,
            walletAddress: patient.walletAddress,
            name: patient.name,
            email: patient.email || "",
            phone: patient.phone || ""
          },
          token
        );
        await preloadPatientDashboard();
        navigate("/patient/dashboard");
        return;
      }

      if (role === "provider") {
        const provider = await getMyProviderProfile();
        login(
          {
            role: "provider",
            walletAddress: provider.walletAddress,
            name: provider.name || "",
            hospitalName: provider.hospitalName || "",
            specialization: provider.specialization || ""
          },
          token
        );
        await preloadProviderDashboard();
        navigate("/provider/dashboard");
        return;
      }

      setError("Account type not recognized. Please contact support.");
    } catch (submitError) {
      setError(formatApiError(submitError, "Login failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md rounded-2xl shadow-soft slide-up" title="Login">
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input id="loginWallet" label="Wallet Address" value={walletAddress} readOnly />
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={connectWallet}
            loading={connecting}
          >
            {walletAddress ? "Reconnect Wallet" : "Connect Wallet"}
          </Button>

          {validation && walletAddress ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              {validation}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={Boolean(validation)} loading={loading}>
            Login
          </Button>
          {loading ? <Loader label="Signing in..." /> : null}
        </form>

        <div className="mt-4 text-sm text-slate-500 dark:text-slate-300">
          <p>
            New patient?{" "}
            <Link to="/patient/register" className="font-medium text-healthcare-blue">
              Create patient account
            </Link>
          </p>
          <p className="mt-1">
            New provider?{" "}
            <Link to="/provider/register" className="font-medium text-healthcare-blue">
              Create provider account
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
