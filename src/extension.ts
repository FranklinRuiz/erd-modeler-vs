import * as vscode from 'vscode';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    ErdDiagramEditorProvider.register(context),
    vscode.commands.registerCommand('erdModeler.newDiagram', (uri?: vscode.Uri) => createNewDiagram(uri)),
    vscode.commands.registerCommand('erdModeler.openFile', (uri?: vscode.Uri) => openFile(uri)),
  );
}

export function deactivate() {}

/**
 * One .asto file = one diagram = one editor tab: VS Code's TextDocument is
 * the single source of truth (native Ctrl+S, dirty-state dot, undo/redo,
 * hot exit), the webview is just a view onto its JSON text.
 */
class ErdDiagramEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'erdModeler.diagramEditor';

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      ErdDiagramEditorProvider.viewType,
      new ErdDiagramEditorProvider(context),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    const distUri = vscode.Uri.joinPath(this.context.extensionUri, 'webview-ui', 'dist');
    webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [distUri] };
    webviewPanel.webview.html = getWebviewHtml(webviewPanel.webview, distUri);

    // Tracks the last text we told the webview about / applied on its behalf,
    // so a document-change event caused by our own edit doesn't get echoed
    // straight back to the webview (which would fight the user's own typing
    // and reset scroll/selection state on every keystroke).
    let lastSyncedText: string | undefined;

    const pushToWebview = (text: string) => {
      lastSyncedText = text;
      webviewPanel.webview.postMessage({ command: 'loadDiagram', json: text });
    };

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      const text = e.document.getText();
      if (text === lastSyncedText) return; // echo of our own edit
      pushToWebview(text); // external change: another editor, git, Live Share, etc.
    });

    // React Flow measures its canvas via ResizeObserver on mount. If the tab
    // was opened in the background (e.g. VS Code restoring multiple editors
    // on startup), it can mount at 0x0 and never recover on its own once the
    // tab becomes visible. Nudging it to re-fit on every visibility change
    // fixes that without affecting the common "opened while active" case.
    const viewStateSub = webviewPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.visible) {
        webviewPanel.webview.postMessage({ command: 'refresh' });
      }
    });

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message?.command) {
        case 'ready':
          pushToWebview(document.getText());
          // Belt-and-suspenders for the same 0x0-mount race: the panel can
          // report itself visible before the webview's own layout has
          // actually settled, so also nudge shortly after first paint.
          setTimeout(() => webviewPanel.webview.postMessage({ command: 'refresh' }), 200);
          return;
        case 'diagramChanged':
          lastSyncedText = message.json;
          await replaceDocumentText(document, message.json);
          return;
      }
    }, undefined, this.context.subscriptions);

    webviewPanel.onDidDispose(() => {
      changeSub.dispose();
      viewStateSub.dispose();
    });
  }
}

async function replaceDocumentText(document: vscode.TextDocument, text: string): Promise<void> {
  if (document.getText() === text) return;
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  edit.replace(document.uri, fullRange, text);
  await vscode.workspace.applyEdit(edit);
}

async function createNewDiagram(folderUri?: vscode.Uri): Promise<void> {
  const defaultDir = folderUri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
  const defaultUri = defaultDir
    ? vscode.Uri.joinPath(defaultDir, 'Untitled.asto')
    : vscode.Uri.file('Untitled.asto');

  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { 'ERD Diagram': ['asto'] },
    saveLabel: 'Create',
  });
  if (!target) return;

  await vscode.workspace.fs.writeFile(target, new Uint8Array());
  await vscode.commands.executeCommand('vscode.openWith', target, ErdDiagramEditorProvider.viewType);
}

async function openFile(uri?: vscode.Uri): Promise<void> {
  let target = uri;
  if (!target) {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'ERD Diagram': ['asto'], 'All Files': ['*'] },
    });
    target = picked?.[0];
  }
  if (!target) return;
  await vscode.commands.executeCommand('vscode.openWith', target, ErdDiagramEditorProvider.viewType);
}

function getWebviewHtml(webview: vscode.Webview, distUri: vscode.Uri): string {
  const indexPath = vscode.Uri.joinPath(distUri, 'index.html');
  let html = fs.readFileSync(indexPath.fsPath, 'utf8');

  const baseHref = webview.asWebviewUri(distUri).toString() + '/';
  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src https://fonts.gstatic.com`,
    `script-src 'nonce-${nonce}' ${webview.cspSource}`,
  ].join('; ');

  html = html.replace(
    '<head>',
    `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">\n    <base href="${baseHref}">`
  );
  // Vite emits `<script type="module" ...>` (no inline scripts), but the module
  // script tag itself still needs the nonce to satisfy the script-src directive.
  html = html.replace(/<script /g, `<script nonce="${nonce}" `);

  return html;
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
