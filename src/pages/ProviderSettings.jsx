import { useState } from "react";
import { formatApiError, updateProviderEncryptionKey } from "../api";
import { getCurrentWalletAddress } from "../blockchain/consent";
import Button from "../components/Button";
import Card from "../components/Card";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";

export default function ProviderSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);

  function addToast(message, tone = "info") {
    setToasts((prev) => [...prev, { id: `${Date.now()}_${Math.random()}`, message, tone }]);
  }

  function removeToast(id) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  async function handleUpdateKey() {
    setLoading(true);
    try {
      if (!window.ethereum) {
        throw new Error("MetaMask not found.");
      }
      const providerAddress =
        user?.walletAddress || (await getCurrentWalletAddress());
      const encryptionPublicKey = await window.ethereum.request({
        method: "eth_getEncryptionPublicKey",
        params: [providerAddress]
      });
      await updateProviderEncryptionKey(providerAddress, encryptionPublicKey);
      addToast("Encryption key updated.", "success");
    } catch (error) {
      addToast(formatApiError(error, "Failed to update encryption key."), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card title="Provider Settings" subtitle="Manage wallet encryption settings">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="accent" loading={loading} onClick={handleUpdateKey}>
            Update Encryption Key
          </Button>
          <p className="text-sm text-slate-600">
            Update this after changing wallets or when key sync is required.
          </p>
        </div>
      </Card>

      <div className="fixed right-4 top-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={removeToast} />
        ))}
      </div>
    </div>
  );
}
