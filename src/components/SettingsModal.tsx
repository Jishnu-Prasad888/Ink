import { useEffect, useRef, useState } from "react";
import { useSettingsStore, type ColorTheme } from "../store/settingsStore";
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
  { value: "system", label: "System", description: "Follow your desktop" },
  { value: "light", label: "Light", description: "Warm paper" },
  { value: "dark", label: "Dark", description: "Deep slate" },
  { value: "nord", label: "Nord", description: "Polar blue" },
  { value: "charcoal", label: "Charcoal", description: "Warm graphite" },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const {
    theme,
    pdfOrientation,
    shortcuts,
    setTheme,
    setPdfOrientation,
    setShortcut,
    resetShortcut,
    resetShortcuts,
  } = useSettingsStore();
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [shortcutError, setShortcutError] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const recordShortcut = (event: React.KeyboardEvent, id: ShortcutId) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecording(null);
      return;
    }
    const shortcut = shortcutFromEvent(event);
    if (!shortcut) return;
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
            'button:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
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
