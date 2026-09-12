import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useSettingsStore, type AppFont, type ColorTheme } from "../store/settingsStore";
import { useRemoteWorkspaceStore } from "../store/remoteWorkspaceStore";
import { DeviceAuthModal } from "./DeviceAuthModal";
import {
  defaultShortcuts,
  formatShortcut,
  shortcutDefinitions,
  shortcutFromEvent,
  type ShortcutId,
} from "../utils/shortcuts";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const themes: { value: ColorTheme; label: string; description: string }[] = [
  { value: "system", label: "System", description: "Match your device" },
  { value: "light", label: "Light", description: "Clean white" },
  { value: "dark", label: "Dark", description: "True black-gray" },
  { value: "nord", label: "Nord", description: "Cool arctic" },
  { value: "charcoal", label: "Charcoal", description: "Warm graphite" },
];

const fonts: { value: AppFont; label: string }[] = [
  { value: "system", label: "System (SF)" },
  { value: "modern", label: "Inter" },
  { value: "accessible", label: "Accessible" },
  { value: "serif", label: "New York / Serif" },
  { value: "monospace", label: "SF Mono" },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const {
    theme,
    appFont,
    pdfOrientation,
    shortcuts,
    setTheme,
    setAppFont,
    setPdfOrientation,
    setShortcut,
    resetShortcut,
    resetShortcuts,
  } = useSettingsStore();
  const { activeRemote } = useRemoteWorkspaceStore();
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [shortcutError, setShortcutError] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [clientIdInput, setClientIdInput] = useState("");
  const [hasClientId, setHasClientId] = useState(false);
  const [clientIdBusy, setClientIdBusy] = useState(false);
  const [clientIdMessage, setClientIdMessage] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    void invoke<boolean>("github_has_token")
      .then(setHasToken)
      .catch(() => setHasToken(false));
    void invoke<boolean>("github_has_oauth_client_id")
      .then(setHasClientId)
      .catch(() => setHasClientId(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const refreshTokenStatus = async () => {
    const [present, clientIdPresent] = await Promise.all([
      invoke<boolean>("github_has_token"),
      invoke<boolean>("github_has_oauth_client_id"),
    ]);
    setHasToken(present);
    setHasClientId(clientIdPresent);
  };

  const saveClientId = async () => {
    setClientIdBusy(true);
    setClientIdMessage("");
    try {
      await invoke("github_set_oauth_client_id", { clientId: clientIdInput });
      setClientIdInput("");
      await refreshTokenStatus();
      setClientIdMessage("OAuth App client id saved.");
    } catch (error) {
      setClientIdMessage(String(error));
    } finally {
      setClientIdBusy(false);
    }
  };

  const clearGithubAccess = async () => {
    try {
      await invoke("github_clear_token");
      await refreshTokenStatus();
      setClientIdMessage("Signed out of GitHub.");
    } catch (error) {
      setClientIdMessage(String(error));
    }
  };

  const recordShortcut = (event: React.KeyboardEvent, id: ShortcutId) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecording(null);
      return;
    }
    const shortcut = shortcutFromEvent(event);
    if (!shortcut) return;
    const definition = shortcutDefinitions.find((item) => item.id === id);
    if (definition?.group !== "Editor" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      setShortcutError("Application shortcuts must include Ctrl, Command, or Alt.");
      return;
    }
    const conflict = shortcutDefinitions.find(
      (definition) =>
        definition.id !== id && shortcuts[definition.id].toLowerCase() === shortcut.toLowerCase(),
    );
    if (conflict) {
      setShortcutError(`${formatShortcut(shortcut)} is already assigned to ${conflict.label}.`);
      return;
    }
    setShortcut(id, shortcut);
    setRecording(null);
    setShortcutError("");
  };

  return (
    <div
      className="dialog-backdrop settings-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !recording) onClose();
        if (event.key !== "Tab" || !dialogRef.current) return;
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
          ),
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-header">
          <div>
            <span className="settings-eyebrow">Ink preferences</span>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </header>

        <div className="settings-body">
          <section className="settings-section" aria-labelledby="appearance-heading">
            <div className="settings-section-heading">
              <div>
                <h3 id="appearance-heading">Appearance</h3>
                <p>Choose a color atmosphere for the workspace.</p>
              </div>
            </div>
            <div className="theme-grid">
              {themes.map((option) => (
                <button
                  key={option.value}
                  className={`theme-card theme-card--${option.value}${theme === option.value ? " active" : ""}`}
                  aria-pressed={theme === option.value}
                  onClick={() => setTheme(option.value)}
                >
                  <span className="theme-swatch" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
            <div className="font-setting settings-row">
              <div>
                <h3>Application font</h3>
                <p>Applied throughout the interface, editor, and preview.</p>
              </div>
              <select
                value={appFont}
                onChange={(event) => setAppFont(event.target.value as AppFont)}
                aria-label="Application font"
              >
                {fonts.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="export-heading">
            <div className="settings-section-heading settings-row">
              <div>
                <h3 id="export-heading">PDF page orientation</h3>
                <p>Default layout used when exporting Markdown.</p>
              </div>
              <select
                value={pdfOrientation}
                onChange={(event) =>
                  setPdfOrientation(event.target.value as "portrait" | "landscape")
                }
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="github-heading">
            <div className="settings-section-heading">
              <div>
                <h3 id="github-heading">GitHub</h3>
                <p>
                  Sign in once with GitHub to open repositories and commit files. Saving a file in
                  an open remote repo commits it directly to that repo&apos;s branch. Access is
                  stored in the OS keychain, not in settings files.
                </p>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <h3>GitHub access</h3>
                <p>
                  {hasToken
                    ? "Signed in. Ink can open repositories and commit on your behalf."
                    : "Not signed in yet."}
                </p>
              </div>
              <span className={`settings-status-pill${hasToken ? " connected" : ""}`}>
                {hasToken ? "Connected" : "Not connected"}
              </span>
            </div>
            <div className="github-token-actions">
              <button
                type="button"
                className="settings-primary-btn"
                onClick={() => setAuthOpen(true)}
              >
                Sign in with GitHub
              </button>
              {hasToken && (
                <button type="button" onClick={() => void clearGithubAccess()}>
                  Sign out
                </button>
              )}
            </div>
            {clientIdMessage && (
              <p className="settings-error" role="status">
                {clientIdMessage}
              </p>
            )}
            <div className="github-token-form">
              <label htmlFor="github-oauth-client-id">
                GitHub OAuth App client id{" "}
                {hasClientId && <span className="settings-status-pill connected">configured</span>}
              </label>
              <input
                id="github-oauth-client-id"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={clientIdInput}
                disabled={clientIdBusy}
                placeholder="Iv1.xxxxxxxxxxxx"
                onChange={(event) => setClientIdInput(event.target.value)}
              />
              <div className="github-token-actions">
                <button
                  type="button"
                  className="settings-primary-btn"
                  disabled={clientIdBusy || !clientIdInput.trim()}
                  onClick={() => void saveClientId()}
                >
                  Save client id
                </button>
                <button
                  type="button"
                  className="settings-link-btn"
                  onClick={() =>
                    void openUrl("https://github.com/settings/developers").catch(() => undefined)
                  }
                >
                  Create an OAuth App on GitHub
                </button>
              </div>
              <p className="open-remote-hint">
                Register a GitHub OAuth App (name Ink, no callback URL needed), then copy its client
                id here once so &quot;Sign in with GitHub&quot; can ask for repository access in
                your browser.
              </p>
            </div>
            {activeRemote && (
              <p className="open-remote-hint">
                Active remote: {activeRemote.owner}/{activeRemote.repo} ({activeRemote.branch})
              </p>
            )}
          </section>

          <DeviceAuthModal
            isOpen={authOpen}
            onClose={() => setAuthOpen(false)}
            onSuccess={() => void refreshTokenStatus()}
          />

          <details className="settings-section shortcuts-section">
            <summary>
              <span>
                <strong>Keyboard shortcuts</strong>
                <small>Click a binding, then press a new key combination.</small>
              </span>
              <span className="settings-chevron" aria-hidden="true">
                ›
              </span>
            </summary>
            <div className="shortcut-list">
              {shortcutDefinitions.map((definition, index) => {
                const previousGroup = shortcutDefinitions[index - 1]?.group;
                return (
                  <div key={definition.id}>
                    {previousGroup !== definition.group && <h4>{definition.group}</h4>}
                    <div className="shortcut-row">
                      <span>{definition.label}</span>
                      <div className="shortcut-actions">
                        <button
                          className={`shortcut-recorder${recording === definition.id ? " recording" : ""}`}
                          onClick={() => {
                            setRecording(definition.id);
                            setShortcutError("");
                          }}
                          onKeyDown={(event) =>
                            recording === definition.id && recordShortcut(event, definition.id)
                          }
                        >
                          {recording === definition.id
                            ? "Press keys…"
                            : formatShortcut(shortcuts[definition.id])}
                        </button>
                        {shortcuts[definition.id] !== defaultShortcuts[definition.id] && (
                          <button
                            className="shortcut-reset"
                            onClick={() => resetShortcut(definition.id)}
                            aria-label={`Reset ${definition.label}`}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {shortcutError && (
              <p className="settings-error" role="alert">
                {shortcutError}
              </p>
            )}
            <button className="settings-reset-all" onClick={resetShortcuts}>
              Reset all shortcuts
            </button>
          </details>
        </div>
      </section>
    </div>
  );
}
