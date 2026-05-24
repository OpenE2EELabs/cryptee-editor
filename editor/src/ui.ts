import type { EditorErrorCode, EditorMode } from "./types";

export class EditorUi {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly status: HTMLElement;
  private readonly canvas: HTMLElement;
  private readonly overlay: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = `
      <div class="shell">
        <header class="topbar">
          <strong class="title"></strong>
          <span class="status"></span>
          <a href="./about.html" target="_blank" rel="noopener">About</a>
        </header>
        <main class="editor-canvas"></main>
        <footer class="licensebar">
          Source: <a href="https://github.com/OpenE2EELabs/cryptee-editor" target="_blank" rel="noopener">github.com/OpenE2EELabs/cryptee-editor</a>
          · <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener">AGPL-3.0</a>
        </footer>
        <section class="overlay" hidden></section>
      </div>
    `;
    this.title = this.must(".title");
    this.status = this.must(".status");
    this.canvas = this.must(".editor-canvas");
    this.overlay = this.must(".overlay");
  }

  setDisplayName(name = "Untitled"): void {
    this.title.textContent = name;
  }

  setStatus(status: string): void {
    this.status.textContent = status;
  }

  setMode(mode: EditorMode): void {
    this.root.dataset.mode = mode;
  }

  editorContainer(): HTMLElement {
    return this.canvas;
  }

  showLoading(message: string): void {
    this.overlay.hidden = false;
    this.overlay.innerHTML = `<div class="dialog"><p>${escapeHtml(message)}</p></div>`;
  }

  showWelcome(): void {
    this.overlay.hidden = false;
    this.overlay.innerHTML = `
      <div class="dialog welcome">
        <h1>cryptee-editor is ready</h1>
        <p>Open this editor from an integrating application with a protocol URL fragment containing an encrypted file URL, file key, file type, and callback origin.</p>
        <div class="actions">
          <a class="button" href="https://github.com/OpenE2EELabs/cryptee-editor/blob/main/docs/PROTOCOL.md" target="_blank" rel="noopener">Protocol</a>
          <a class="button secondary" href="https://github.com/OpenE2EELabs/cryptee-editor/tree/main/examples" target="_blank" rel="noopener">Examples</a>
        </div>
      </div>
    `;
  }

  hideOverlay(): void {
    this.overlay.hidden = true;
    this.overlay.innerHTML = "";
  }

  showError(code: EditorErrorCode, message: string, onRetry: () => void, onExit: () => void): void {
    this.overlay.hidden = false;
    this.overlay.innerHTML = `
      <div class="dialog error">
        <h1>Unable to open document</h1>
        <p><code>${escapeHtml(code)}</code></p>
        <p>${escapeHtml(message)}</p>
        <div class="actions">
          <button type="button" data-action="retry">Retry</button>
          <button type="button" data-action="exit">Exit</button>
        </div>
      </div>
    `;
    this.overlay.querySelector("[data-action='retry']")?.addEventListener("click", onRetry);
    this.overlay.querySelector("[data-action='exit']")?.addEventListener("click", onExit);
  }

  private must(selector: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (!element) {
      throw new Error(`Missing UI element ${selector}`);
    }
    return element;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return entities[char];
  });
}
