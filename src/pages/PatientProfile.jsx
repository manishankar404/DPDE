import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { formatApiError, getMyPatientProfile, updateMyPatientProfile } from "../api";

function shortenWallet(wallet = "") {
  const value = String(wallet || "");
  if (!value || value.length < 10) return value || "";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function PatientProfile() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", email: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [toasts, setToasts] = useState([]);

  function addToast(message, tone = "info") {
    setToasts((prev) => [...prev, { id: `${Date.now()}_${Math.random()}`, message, tone }]);
  }

  function removeToast(id) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  function openProfileEditor() {
    setProfileForm({
      name: user?.name || "",
      email: user?.email || "",
      phone: user?.phone || ""
    });
    setProfileModalOpen(true);
  }

  async function saveProfile() {
    if (!profileForm.name.trim()) {
      addToast("Name is required.", "error");
      return;
    }
    setSavingProfile(true);
    try {
      const updated = await updateMyPatientProfile({
        name: profileForm.name.trim(),
        email: profileForm.email.trim(),
        phone: profileForm.phone.trim()
      });
      updateUser({
        name: updated?.name || profileForm.name.trim(),
        email: updated?.email || profileForm.email.trim(),
        phone: updated?.phone || profileForm.phone.trim(),
        patientId: updated?.patientId || user?.patientId,
        walletAddress: updated?.walletAddress || user?.walletAddress
      });
      addToast("Profile updated.", "success");
      setProfileModalOpen(false);
    } catch (error) {
      addToast(formatApiError(error, "Failed to update profile."), "error");
    } finally {
      setSavingProfile(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadMyProfile() {
      try {
        const profile = await getMyPatientProfile();
        if (!active || !profile) return;
        updateUser({
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          patientId: profile.patientId,
          walletAddress: profile.walletAddress
        });
      } catch {
        // ignore
      }
    }
    loadMyProfile();
    return () => {
      active = false;
    };
  }, [updateUser]);

  return (
    <div className="space-y-6">
      <Card title="Profile" subtitle="Manage your patient profile details.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={() => navigate("/patient/dashboard")}>
            Back
          </Button>
          <Button type="button" variant="ghost" onClick={openProfileEditor}>
            Edit Profile
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="text-xs font-medium text-slate-500">Name</div>
            <div className="text-sm font-semibold text-slate-900">{user?.name || "Patient"}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Patient ID</div>
            <div className="text-sm text-slate-700">{user?.patientId || "—"}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Wallet</div>
            <div className="font-mono text-sm text-slate-700">
              {shortenWallet(user?.walletAddress) || "—"}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Email</div>
            <div className="text-sm text-slate-700">{user?.email || "—"}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Phone</div>
            <div className="text-sm text-slate-700">{user?.phone || "—"}</div>
          </div>
        </div>
      </Card>

      <Modal open={profileModalOpen} title="Edit Profile" onClose={() => setProfileModalOpen(false)}>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            saveProfile();
          }}
        >
          <Input
            id="patientProfileName"
            label="Name"
            value={profileForm.name}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <Input
            id="patientProfileEmail"
            label="Email (optional)"
            value={profileForm.email}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
          />
          <Input
            id="patientProfilePhone"
            label="Phone (optional)"
            value={profileForm.phone}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, phone: event.target.value }))}
          />

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" disabled={savingProfile} onClick={() => setProfileModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={savingProfile}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {toasts.length ? (
        <div className="fixed bottom-4 right-4 z-50 w-[92vw] max-w-sm space-y-2">
          {toasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onClose={removeToast} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

