import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ActiveRemote {
  rootPath: string;
  owner: string;
  repo: string;
  url: string;
  branch: string;
}

interface RemoteWorkspaceStore {
  activeRemote: ActiveRemote | null;
  setActiveRemote: (remote: ActiveRemote | null) => void;
  clearActiveRemoteIfRoot: (rootPath: string | null) => void;
}

function pathsEqual(a: string, b: string): boolean {
  const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return normalize(a) === normalize(b);
}

/** True when a path uses the virtual GitHub scheme (no local file). */
export function isRemotePath(path: string): boolean {
  return path.startsWith("github://");
}

/** Splits a `github://owner/repo/branch/...path` virtual path into its parts. */
export function parseRemotePath(
  path: string,
): { owner: string; repo: string; branch: string; relPath: string } | null {
  if (!isRemotePath(path)) return null;
  const rest = path.slice("github://".length);
  const [owner, repo, branch, ...tail] = rest.split("/");
  if (!owner || !repo || !branch) return null;
  return { owner, repo, branch, relPath: tail.join("/") };
}

export function isPathUnderRemoteRoot(filePath: string, rootPath: string): boolean {
  const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");
  const file = normalize(filePath);
  const root = normalize(rootPath);
  if (file.length < root.length) return false;
  const fileLower = file.toLowerCase();
  const rootLower = root.toLowerCase();
  return fileLower === rootLower || fileLower.startsWith(`${rootLower}/`);
}

export function relativePathUnderRoot(filePath: string, rootPath: string): string {
  const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");
  const file = normalize(filePath);
  const root = normalize(rootPath);
  if (file.toLowerCase().startsWith(root.toLowerCase())) {
    const relative = file.slice(root.length).replace(/^\/+/, "");
    return relative || file.split("/").pop() || file;
  }
  return file.split("/").pop() || file;
}

export const useRemoteWorkspaceStore = create<RemoteWorkspaceStore>()(
  persist(
    (set, get) => ({
      activeRemote: null,
      setActiveRemote: (activeRemote) => set({ activeRemote }),
      clearActiveRemoteIfRoot: (rootPath) => {
        const active = get().activeRemote;
        if (!active) return;
        if (rootPath === null || pathsEqual(active.rootPath, rootPath)) {
          set({ activeRemote: null });
        }
      },
    }),
    {
      name: "ink-remote-workspace",
      version: 2,
      partialize: (state) => ({
        activeRemote: state.activeRemote,
      }),
    },
  ),
);
