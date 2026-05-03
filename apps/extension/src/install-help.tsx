import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { InstallHelpApp } from "./InstallHelpApp";
import "./install-help.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found.");
}

createRoot(root).render(
  <StrictMode>
    <InstallHelpApp />
  </StrictMode>
);
