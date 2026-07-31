import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentFile {
  path: string;
  fileName: string;
  openedAt: number;
}

interface RecentFilesStore {
  recentFiles: RecentFile[];
  addRecentFile: (path: string, fileName: string) => void;
  removeRecentFile: (path: string) => void;
  clearRecentFiles: () => void;
}

export const useRecentFilesStore = create<RecentFilesStore>()(
  persist(
    (set) => ({
      recentFiles: [],
      addRecentFile: (path, fileName) =>
        set((state) => ({
          recentFiles: [
            { path, fileName, openedAt: Date.now() },
            ...state.recentFiles.filter((file) => file.path !== path),
          ].slice(0, 8),
        })),
      removeRecentFile: (path) =>
        set((state) => ({
          recentFiles: state.recentFiles.filter((file) => file.path !== path),
        })),
      clearRecentFiles: () => set({ recentFiles: [] }),
    }),
    { name: "ink-recent-files" },
  ),
);
