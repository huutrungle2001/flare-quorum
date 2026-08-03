import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./shell/App";
import { ToastProvider } from "./shell/ToastProvider";
import "./shell/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Tender Room root element is missing");

createRoot(root).render(
  <StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ToastProvider>
  </StrictMode>,
);
