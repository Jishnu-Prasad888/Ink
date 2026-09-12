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
  autoCommitOnSave: boolean;
  autoPushOnCommit: boolean;
  setActiveRemote: (remote: ActiveRemote | null) => void;
  setAutoCommitOnSave: (value: boolean) => void;
  setAutoPushOnCommit: (value: boolean) => void;
  clearActiveRemoteIfRoot: (rootPath: string | null) => void;
}

function pathsEqual(a: string, b: string): boolean {
  const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return normalize(a) === normalize(b);
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
      autoCommitOnSave: true,
      autoPushOnCommit: false,
      setActiveRemote: (activeRemote) => set({ activeRemote }),
      setAutoCommitOnSave: (autoCommitOnSave) => set({ autoCommitOnSave }),
      setAutoPushOnCommit: (autoPushOnCommit) => set({ autoPushOnCommit }),
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
      version: 1,
      partialize: (state) => ({
        activeRemote: state.activeRemote,
        autoCommitOnSave: state.autoCommitOnSave,
        autoPushOnCommit: state.autoPushOnCommit,
      }),
    },
  ),
);
