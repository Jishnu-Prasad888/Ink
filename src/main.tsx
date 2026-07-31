import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useSettingsStore } from "./store/settingsStore";
import "./styles/globals.css";

document.documentElement.dataset.theme = useSettingsStore.getState().theme;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
