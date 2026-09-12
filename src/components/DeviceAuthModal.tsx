import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

interface DeviceAuthInfo {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

interface DeviceAuthStatus {
  authorized: boolean;
  code: string;
  message: string;
}

interface DeviceAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const TERMINAL_CODES = new Set(["access_denied", "expired_token", "incorrect_client_credentials"]);

export function DeviceAuthModal({ isOpen, onClose, onSuccess }: DeviceAuthModalProps) {
  const [auth, setAuth] = useState<DeviceAuthInfo | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const pollRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onCloseRef.current = onClose;
    onSuccessRef.current = onSuccess;
  });

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    pollRef.current = false;
    if (timerRef.current) window.clearTimeout(timerRef.current);

    void invoke<DeviceAuthInfo>("github_start_device_auth")
      .then(async (info) => {
        if (cancelled) return;
        setStatus("");
        setError("");
        setDone(false);
        setAuth(info);
        await openUrl(info.verificationUri).catch(() => undefined);
        pollRef.current = true;
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });

    return () => {
      cancelled = true;
      pollRef.current = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!auth) return;
    const poll = async () => {
      if (!pollRef.current) return;
      try {
        const result = await invoke<DeviceAuthStatus>("github_poll_device_auth", {
          deviceCode: auth.deviceCode,
        });
        if (!pollRef.current) return;
        if (result.authorized) {
          setDone(true);
          setStatus(result.message);
          window.setTimeout(() => {
            if (!pollRef.current) return;
            onSuccessRef.current();
            onCloseRef.current();
          }, 900);
          return;
        }
        setStatus(result.message);
        if (TERMINAL_CODES.has(result.code)) {
          setError(result.message);
          pollRef.current = false;
          return;
        }
      } catch (err) {
        if (!pollRef.current) return;
        setStatus(String(err));
      }
      timerRef.current = window.setTimeout(poll, (auth.interval || 5) * 1000);
    };
    timerRef.current = window.setTimeout(poll, 0);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [auth]);

  if (!isOpen) return null;

  const copyCode = () => {
    if (auth) void navigator.clipboard.writeText(auth.userCode).catch(() => undefined);
  };

  const idle = !auth && !error;

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !done) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !done) onClose();
      }}
    >
      <section
        className="save-dialog open-remote-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-auth-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="device-auth-title">Sign in with GitHub</h2>
        {error ? (
          <>
            <p className="open-remote-error" role="alert">
              {error}
            </p>
            <div className="save-dialog-actions">
              <button type="button" className="primary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : auth ? (
          <>
            <p>
              In the browser that just opened, enter this code to grant Ink access to your
              repositories:
            </p>
            <div className="device-auth-code">
              <code>{auth.userCode}</code>
              <button type="button" className="sidebar-btn" onClick={copyCode}>
                Copy
              </button>
            </div>
            <p className="open-remote-hint">
              {auth.verificationUri}
              {done ? "" : " · expires in a few minutes"}
            </p>
            {status && (
              <p className="open-remote-hint" role="status">
                {status}
              </p>
            )}
            <div className="save-dialog-actions">
              {!done && (
                <button type="button" onClick={onClose}>
                  Cancel
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="open-remote-hint" role="status">
              {idle ? "Connecting to GitHub…" : ""}
            </p>
            <div className="save-dialog-actions">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
