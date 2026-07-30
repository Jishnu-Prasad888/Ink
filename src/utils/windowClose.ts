import { getCurrentWindow } from "@tauri-apps/api/window";

export interface DestroyableWindow {
  destroy: () => Promise<void>;
}

export const destroyWindow = (window: DestroyableWindow = getCurrentWindow()): Promise<void> =>
  window.destroy();
