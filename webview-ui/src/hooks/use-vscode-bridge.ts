import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useDiagramStore } from '@/store/diagram-store';
import { exportDiagramAsJSON, importDiagramFromJSON } from '@/utils/export';
import { createDiagram } from '@/utils/factories';
import { getFlowInstance } from '@/utils/flowInstance';
import { isVSCode, onExtensionMessage, postToExtension } from '@/lib/vscode-bridge';

const DEBOUNCE_MS = 400;

/**
 * Wires this webview to a single VS Code document (one .asto file = one
 * diagram editor tab). The extension host owns
 * the file via a CustomTextEditorProvider; this hook hydrates the store from
 * the document's text on load/external change, and pushes the active diagram
 * back to the extension on every edit so Ctrl+S, the dirty-state dot, and
 * undo/redo work through VS Code's native document model.
 */
export function useVscodeBridge() {
  const suppressNextPush = useRef(false);

  useEffect(() => {
    if (!isVSCode()) return;

    const unsubscribeMessages = onExtensionMessage((message) => {
      if (message?.command === 'refresh') {
        // React Flow sizes its canvas from the DOM at mount time; if this tab
        // wasn't visible then, it can be stuck thinking it has 0 width. The
        // extension pings this on visibility change / shortly after first
        // paint — re-fitting here forces it to remeasure against the real,
        // now-current container size.
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event('resize'));
          getFlowInstance()?.fitView({ duration: 0 });
        });
        return;
      }
      if (message?.command !== 'loadDiagram') return;

      let diagram;
      if (!message.json || !message.json.trim()) {
        diagram = createDiagram('Untitled Diagram');
      } else {
        try {
          diagram = importDiagramFromJSON(message.json);
        } catch (err) {
          console.error(err);
          toast.error('This file is not a valid SchemaCraft diagram.');
          return;
        }
      }
      // The resulting state change must not bounce straight back to the
      // extension as if it were a user edit — it's just us catching up to
      // what the document (the source of truth) already contains.
      suppressNextPush.current = true;
      useDiagramStore.getState().hydrateSingleDiagram(diagram);
    });

    let debounceHandle: ReturnType<typeof setTimeout> | undefined;
    const unsubscribeStore = useDiagramStore.subscribe((state) => {
      if (suppressNextPush.current) {
        suppressNextPush.current = false;
        return;
      }
      const diagram = state.getActiveDiagram();
      if (!diagram) return;
      clearTimeout(debounceHandle);
      debounceHandle = setTimeout(() => {
        postToExtension({ command: 'diagramChanged', json: exportDiagramAsJSON(diagram) });
      }, DEBOUNCE_MS);
    });

    postToExtension({ command: 'ready' });

    return () => {
      unsubscribeMessages();
      unsubscribeStore();
      clearTimeout(debounceHandle);
    };
  }, []);
}
