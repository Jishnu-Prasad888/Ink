import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRemoteWorkspaceStore, type ActiveRemote } from "../store/remoteWorkspaceStore";

interface CloneResult {
  rootPath: string;
  owner: string;
  repo: string;
  url: string;
  branch: string;
  reusedExisting: boolean;
}

interface OpenRemoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpened: (remote: ActiveRemote, reusedExisting: boolean) => void;
  onError: (message: string) => void;
}

export function OpenRemoteModal({ isOpen, onClose, onOpened, onError }: OpenRemoteModalProps) {
  const setActiveRemote = useRemoteWorkspaceStore((s) => s.setActiveRemote);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [localError, setLocalError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    void invoke<boolean>("github_has_token")
      .then(setHasToken)
      .catch(() => setHasToken(false));
    inputRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClone = async () => {
    const value = input.trim();
    if (!value) {
      setLocalError("Enter a GitHub repository as owner/repo or a URL.");
      return;
    }
    setBusy(true);
    setLocalError("");
    try {
      const result = await invoke<CloneResult>("clone_github_repo", { input: value });
      const remote: ActiveRemote = {
        rootPath: result.rootPath,
        owner: result.owner,
        repo: result.repo,
        url: result.url,
        branch: result.branch,
      };
      setActiveRemote(remote);
      onOpened(remote, result.reusedExisting);
      onClose();
      setInput("");
    } catch (error) {
      const message = String(error);
      setLocalError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="save-dialog open-remote-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-remote-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="open-remote-title">Open Remote</h2>
        <p>
          Clone a GitHub repository into Ink&apos;s local workspace. Public repos work without a
          token; private repos need a Personal Access Token in Settings.
        </p>
        <label className="open-remote-label" htmlFor="open-remote-input">
          Repository
        </label>
        <input
          id="open-remote-input"
          ref={inputRef}
          className="open-remote-input"
          value={input}
          disabled={busy}
          placeholder="owner/repo or https://github.com/owner/repo"
          aria-invalid={Boolean(localError)}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !busy) void handleClone();
          }}
        />
        <p className="open-remote-hint">
          {hasToken
            ? "GitHub token is saved for private repos and push."
            : "No token saved — public clones only until you add one in Settings."}
        </p>
        {localError && (
          <p className="open-remote-error" role="alert">
            {localError}
          </p>
        )}
        <div className="save-dialog-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void handleClone()}
            disabled={busy}
          >
            {busy ? "Opening…" : "Open"}
          </button>
        </div>
      </section>
    </div>
  );
}
