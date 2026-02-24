import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import Loader from "../components/Loader";
import { formatApiError, getPatientById, requestNonce, verifySignature } from "../api";
import { ensureSepolia } from "../blockchain/consent";
import { useAuth } from "../context/AuthContext";

function preloadPatientDashboard() {
  return Promise.all([
    import("../layout/DashboardLayout"),
    import("./PatientDashboard")
  ]);
}

export default function PatientLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [patientId, setPatientId] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const validation = useMemo(() => {
    if (!patientId.trim()) return "Patient ID is required.";
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress.trim())) return "Connect a wallet.";
    return "";
  }, [patientId, walletAddress]);

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
    setError("");
    setLoading(true);

    try {
      await ensureSepolia();
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      if (address.toLowerCase() !== walletAddress.trim().toLowerCase()) {
        setError("Connected wallet address changed. Please reconnect.");
        return;
      }

      const { nonce } = await requestNonce(address);
      const signature = await signer.signMessage(nonce);
      const { token } = await verifySignature({ walletAddress: address, signature });

      const patient = await getPatientById(patientId.trim());
      if (patient.walletAddress.toLowerCase() !== walletAddress.trim().toLowerCase()) {
        setError("Wallet address does not match this patient ID.");
        return;
      }
      login({
        role: "patient",
        patientId: patient.patientId,
        walletAddress: patient.walletAddress,
        name: patient.name
      }, token);
      await preloadPatientDashboard();
      navigate("/patient/dashboard");
    } catch (submitError) {
      setError(formatApiError(submitError, "Login failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md rounded-2xl shadow-soft slide-up" title="Patient Login">
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input
            id="patientLoginId"
            label="Patient ID"
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
          />
          <Input
            id="patientLoginWallet"
            label="Wallet Address"
            value={walletAddress}
            readOnly
          />
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={connectWallet}
            loading={connecting}
          >
            {walletAddress ? "Reconnect Wallet" : "Connect Wallet"}
          </Button>

          {validation && (patientId || walletAddress) ? (
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
          New patient?{" "}
          <Link to="/patient/register" className="font-medium text-healthcare-blue">
            Create account
          </Link>
        </p>
      </Card>
    </div>
  );
}
