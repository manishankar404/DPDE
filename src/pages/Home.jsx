import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { networkConfig } from "../styles/theme";

export default function Home() {
  const [walletStatus, setWalletStatus] = useState("Not connected");

  useEffect(() => {
    async function checkWallet() {
      if (!window.ethereum) {
        setWalletStatus("Wallet not detected");
        return;
      }
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (!accounts || accounts.length === 0) {
        setWalletStatus("Not connected");
        return;
      }
      const wallet = accounts[0];
      setWalletStatus(`${wallet.slice(0, 6)}...${wallet.slice(-4)}`);
    }

    checkWallet();
  }, []);

  return (
    <div className="relative flex min-h-[calc(100vh-65px)] items-center justify-center overflow-hidden px-4">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-teal-50" />
      <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-teal-200/30 blur-3xl" />
      <div className="absolute -bottom-16 -left-24 h-80 w-80 rounded-full bg-blue-200/30 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-4xl text-center slide-up">
        <h1 className="text-4xl font-bold text-slate-900 md:text-5xl">
          Secure, Decentralized Healthcare Data Exchange
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          DPDE enables patients and providers to exchange encrypted health records
          through blockchain-backed consent workflows and auditable access control.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            to="/patient/login"
            className="w-64 rounded-2xl bg-healthcare-blue px-6 py-4 text-center text-base font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-blue-800"
          >
            Patient Portal
          </Link>
          <Link
            to="/provider/login"
            className="w-64 rounded-2xl bg-healthcare-teal px-6 py-4 text-center text-base font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-teal-700"
          >
            Provider Portal
          </Link>
        </div>

        <footer className="mt-16 rounded-xl border border-slate-200 bg-white/80 px-5 py-3 text-sm text-slate-600 shadow-sm">
          <span className="mr-6 font-medium">Network: {networkConfig.name}</span>
          <span>Wallet: {walletStatus}</span>
        </footer>
      </div>
    </div>
  );
}

