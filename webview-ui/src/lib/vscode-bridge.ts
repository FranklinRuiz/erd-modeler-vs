// Thin bridge to the VS Code webview host. `acquireVsCodeApi()` is injected by
// VS Code into the webview's global scope and may only be called once per
// webview lifetime, so the handle is acquired lazily and cached here.

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let api: VsCodeApi | null = null;
let attempted = false;

function getApi(): VsCodeApi | null {
  if (!attempted) {
    attempted = true;
    try {
      api = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
    } catch {
      api = null;
    }
  }
  return api;
}

export function isVSCode(): boolean {
  return getApi() !== null;
}

export function postToExtension(message: Record<string, unknown>): void {
  getApi()?.postMessage(message);
}

/** Messages the extension host (src/extension.ts) posts into this webview. */
export type ExtensionMessage =
  | { command: 'loadDiagram'; json: string }
  | { command: 'refresh' };

export function onExtensionMessage(handler: (message: ExtensionMessage | undefined) => void): () => void {
  const listener = (event: MessageEvent<ExtensionMessage | undefined>) => handler(event.data);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
