import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export const useSingleInstance = () => {
  useEffect(() => {
    // Listen for file open events from second instance
    const unlisten = listen("open-files", (event: any) => {
      console.log("Received files from second instance:", event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
};
