import { invoke } from "@tauri-apps/api/core";

export type InvokeCommand = (command: string) => Promise<unknown>;

export const quitApp = async (
  invokeCommand: InvokeCommand = (command) => invoke(command),
): Promise<void> => {
  await invokeCommand("quit_app");
};
