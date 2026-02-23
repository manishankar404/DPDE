import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import {
  getMyPatientAccessStatus,
  getPendingRequests as getPendingProviderRequests,
  getCurrentWalletAddress
} from "../blockchain/consent";

const AccessContext = createContext(null);

export function AccessProvider({ children }) {
  const { user } = useAuth();
  const [patientAccessStatus, setPatientAccessStatus] = useState("");
  const [pendingRequests, setPendingRequests] = useState([]);

  const refreshAccessStatus = useCallback(
    async (patientAddress) => {
      if (!patientAddress || user?.role !== "provider") {
        setPatientAccessStatus("");
        return "";
      }
      try {
        const status = await getMyPatientAccessStatus(patientAddress);
        setPatientAccessStatus(status);
        return status;
      } catch (error) {
        console.error("[Access] refreshAccessStatus failed", {
          patientAddress,
          error: error?.message || error
        });
        // Do not block UI if chain call fails (e.g., stale contract deployment/ABI mismatch).
        setPatientAccessStatus("");
        return "";
      }
    },
    [user?.role]
  );

  const refreshPendingRequests = useCallback(
    async (patientAddress) => {
      const target = patientAddress || (user?.role === "patient" ? user.walletAddress : "");
      if (!target) {
        setPendingRequests([]);
        return [];
      }
      try {
        const list = await getPendingProviderRequests(target);
        setPendingRequests(Array.isArray(list) ? list : []);
        return list;
      } catch (error) {
        console.error("[Access] refreshPendingRequests failed", {
          patientAddress: target,
          error: error?.message || error
        });
        setPendingRequests([]);
        return [];
      }
    },
    [user]
  );

  const value = useMemo(
    () => ({
      patientAccessStatus,
      pendingRequests,
      refreshAccessStatus,
      refreshPendingRequests,
      getCurrentWalletAddress
    }),
    [patientAccessStatus, pendingRequests, refreshAccessStatus, refreshPendingRequests]
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const context = useContext(AccessContext);
  if (!context) throw new Error("useAccess must be used within AccessProvider");
  return context;
}
