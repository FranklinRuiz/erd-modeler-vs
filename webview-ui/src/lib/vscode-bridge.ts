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

export function onExtensionMessage(handler: (message: any) => void): () => void {
  const listener = (event: MessageEvent) => handler(event.data);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
