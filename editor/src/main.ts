import "./styles.css";
import { ChainPadClient } from "./chainpad-client";
import { EditorRuntime } from "./editor-loader";
import { createProtocolBridge, parseFragment, ProtocolError } from "./protocol";
import { EditorUi } from "./ui";
import type { EditorErrorCode } from "./types";

const VERSION = "0.1.0";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("Missing #app");
}

const ui = new EditorUi(root);

void boot();

async function boot(): Promise<void> {
  let bridge: ReturnType<typeof createProtocolBridge> | undefined;
  try {
    ui.showLoading("Loading editor...");
    if (!window.location.hash || window.location.hash === "#") {
      ui.setDisplayName("cryptee-editor");
      ui.setStatus("Ready");
      ui.showWelcome();
      return;
    }
    const config = parseFragment();
    ui.setDisplayName(config.displayName);
    ui.setMode(config.mode);
    bridge = createProtocolBridge(config.callbackOrigin);
    const activeBridge = bridge;
    activeBridge.emit({ type: "editor:ready", version: VERSION });

    const runtime = new EditorRuntime(config, undefined, (message) => {
      ui.setStatus(message);
      ui.showLoading(message);
    });
    const chainpad = new ChainPadClient(config, activeBridge.emit, (patch) => runtime.getAdapter().applyRemotePatch(patch));
    runtime.getAdapter().onLocalPatch((patch) => chainpad.sendPatch(patch));

    activeBridge.onMessage((event) => {
      if (event.type === "parent:save-request") {
        void save(runtime, activeBridge, Boolean(config.saveUrl));
      }
      if (event.type === "parent:exit-request") {
        activeBridge.emit({ type: "editor:exit" });
      }
      if (event.type === "parent:update-permissions") {
        runtime.getAdapter().setMode(event.mode);
        ui.setMode(event.mode);
      }
      if (event.type === "parent:set-display-name") {
        runtime.getAdapter().setDisplayName(event.name);
        ui.setDisplayName(event.name);
      }
    });

    await runtime.load(ui.editorContainer());
    activeBridge.emit({ type: "editor:document-loaded" });

    if (config.sessionId) {
      ui.setStatus("Connecting to collaboration...");
      await chainpad.connect();
    }

    ui.setStatus("Ready");
    ui.hideOverlay();
  } catch (error) {
    const code: EditorErrorCode = error instanceof ProtocolError ? "invalid-config" : "editor-load-failed";
    const message = error instanceof Error ? error.message : "Unknown error";
    bridge?.emit({ type: "editor:error", code, message });
    ui.showError(code, message, () => location.reload(), () => bridge?.emit({ type: "editor:exit" }));
  }
}

async function save(
  runtime: EditorRuntime,
  bridge: ReturnType<typeof createProtocolBridge>,
  hasUploadTarget: boolean
): Promise<void> {
  try {
    ui.setStatus("Saving...");
    bridge.emit({ type: "editor:saving" });
    const encryptedBytes = await runtime.save();
    if (hasUploadTarget) {
      bridge.emit({ type: "editor:save-uploaded" });
    }
    bridge.emit({ type: "editor:saved", encryptedBytes, contentType: "application/octet-stream" });
    ui.setStatus("Saved");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown save error";
    bridge.emit({ type: "editor:error", code: "save-upload-failed", message });
    ui.showError("save-upload-failed", message, () => void save(runtime, bridge, hasUploadTarget), () =>
      bridge.emit({ type: "editor:exit" })
    );
  }
}
