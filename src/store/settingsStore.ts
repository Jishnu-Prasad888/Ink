import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultShortcuts, type ShortcutId, type ShortcutMap } from "../utils/shortcuts";

export type ColorTheme = "system" | "light" | "dark" | "nord" | "charcoal";
export type PdfOrientation = "portrait" | "landscape";
export type AppFont = "system" | "modern" | "accessible" | "serif" | "monospace";

interface SettingsStore {
  theme: ColorTheme;
  appFont: AppFont;
  pdfOrientation: PdfOrientation;
  shortcuts: ShortcutMap;
  setTheme: (theme: ColorTheme) => void;
  setAppFont: (font: AppFont) => void;
  setPdfOrientation: (orientation: PdfOrientation) => void;
  setShortcut: (id: ShortcutId, shortcut: string) => void;
  resetShortcut: (id: ShortcutId) => void;
  resetShortcuts: () => void;
}

const validThemes: ColorTheme[] = ["system", "light", "dark", "nord", "charcoal"];
const validFonts: AppFont[] = ["system", "modern", "accessible", "serif", "monospace"];
const legacyTheme =
  typeof localStorage === "undefined"
    ? null
    : (localStorage.getItem("ink-theme") as ColorTheme | null);

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: legacyTheme && validThemes.includes(legacyTheme) ? legacyTheme : "system",
      appFont: "system",
      pdfOrientation: "portrait",
      shortcuts: defaultShortcuts,
      setTheme: (theme) => set({ theme }),
      setAppFont: (appFont) => set({ appFont }),
      setPdfOrientation: (pdfOrientation) => set({ pdfOrientation }),
      setShortcut: (id, shortcut) =>
        set((state) => ({ shortcuts: { ...state.shortcuts, [id]: shortcut } })),
      resetShortcut: (id) =>
        set((state) => ({ shortcuts: { ...state.shortcuts, [id]: defaultShortcuts[id] } })),
      resetShortcuts: () => set({ shortcuts: defaultShortcuts }),
    }),
    {
      name: "ink-settings",
      version: 3,
      migrate: (persisted, version) => {
        const saved = persisted as Partial<SettingsStore>;
        const shortcuts: Partial<ShortcutMap> = { ...saved.shortcuts };
        if (version < 2 && shortcuts["app.commandPalette"] === "Mod+Shift+P") {
          shortcuts["app.commandPalette"] = defaultShortcuts["app.commandPalette"];
        }
        // Alt+Shift+Arrow moved from adding cursors to duplicating lines.
        if (version < 3) {
          if (shortcuts["editor.addCursorAbove"] === "Alt+Shift+ArrowUp") {
            shortcuts["editor.addCursorAbove"] = defaultShortcuts["editor.addCursorAbove"];
          }
          if (shortcuts["editor.addCursorBelow"] === "Alt+Shift+ArrowDown") {
            shortcuts["editor.addCursorBelow"] = defaultShortcuts["editor.addCursorBelow"];
          }
        }
        return saved.shortcuts ? { ...saved, shortcuts: shortcuts as ShortcutMap } : saved;
      },
      merge: (persisted, current) => {
        const saved = persisted as Partial<SettingsStore>;
        return {
          ...current,
          ...saved,
          theme: saved.theme && validThemes.includes(saved.theme) ? saved.theme : current.theme,
          appFont:
            saved.appFont && validFonts.includes(saved.appFont) ? saved.appFont : current.appFont,
          shortcuts: { ...defaultShortcuts, ...saved.shortcuts },
        };
      },
    },
  ),
);
