import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AccessProvider } from "./context/AccessContext";
import { AuthProvider } from "./context/AuthContext";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <AccessProvider>
        <App />
      </AccessProvider>
    </AuthProvider>
  </StrictMode>
);
