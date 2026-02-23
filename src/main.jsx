import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AccessProvider } from "./context/AccessContext";
import { AuthProvider } from "./context/AuthContext";
import { ensureSepolia } from "./blockchain/consent";
import "./index.css";

ensureSepolia().catch((error) => {
  console.error("[App] Failed to switch to Sepolia on load", error);
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <AccessProvider>
        <App />
      </AccessProvider>
    </AuthProvider>
  </StrictMode>
);
