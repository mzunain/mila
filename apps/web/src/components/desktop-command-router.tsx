"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

type DesktopCommand =
  | "mila:cmd:new-meeting"
  | "mila:cmd:quick-note"
  | "mila:cmd:preferences"
  | "mila:cmd:start-mic"
  | "mila:cmd:stop-mic";

type DesktopBridge = {
  onCommand?: (channel: DesktopCommand, callback: () => void) => () => void;
};

type WorkspaceCommand =
  | "mila:desktop-new-meeting"
  | "mila:desktop-start-mic"
  | "mila:desktop-stop-mic";

const PENDING_WORKSPACE_COMMAND_KEY = "mila:pending-desktop-command";

export function DesktopCommandRouter() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const bridge = (window as Window & { mila?: DesktopBridge }).mila;
    if (!bridge?.onCommand) return;

    const sendWorkspaceCommand = (command: WorkspaceCommand) => {
      if (pathname === "/app") {
        window.dispatchEvent(new Event(command));
        return;
      }

      try {
        window.sessionStorage.setItem(PENDING_WORKSPACE_COMMAND_KEY, command);
      } catch {
        // The route change still gives the workspace a chance to consume any
        // persisted meeting signal from the preload bridge.
      }
      router.push("/app");
    };

    const disposers = [
      bridge.onCommand("mila:cmd:preferences", () => {
        router.push("/app/preferences");
      }),
      bridge.onCommand("mila:cmd:new-meeting", () => {
        sendWorkspaceCommand("mila:desktop-new-meeting");
      }),
      bridge.onCommand("mila:cmd:quick-note", () => {
        router.push("/app/chat");
      }),
      bridge.onCommand("mila:cmd:start-mic", () => {
        sendWorkspaceCommand("mila:desktop-start-mic");
      }),
      bridge.onCommand("mila:cmd:stop-mic", () => {
        sendWorkspaceCommand("mila:desktop-stop-mic");
      }),
    ];

    return () => {
      for (const dispose of disposers) dispose();
    };
  }, [pathname, router]);

  return null;
}
