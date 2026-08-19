import { useEffect } from 'react';
import { useDiagramStore, useUIStore } from '@/store';

const NUDGE_STEP = 20;
const NUDGE_STEP_FINE = 1;

export function useKeyboardShortcuts() {
  const addTable = useDiagramStore((s) => s.addTable);
  const deleteTable = useDiagramStore((s) => s.deleteTable);
  const deleteEdge = useDiagramStore((s) => s.deleteEdge);
  const duplicateTable = useDiagramStore((s) => s.duplicateTable);
  const moveTable = useDiagramStore((s) => s.moveTable);
  const undo = useDiagramStore((s) => s.undo);
  const redo = useDiagramStore((s) => s.redo);
  const selectedTableId = useUIStore((s) => s.selectedTableId);
  const selectedEdgeId = useUIStore((s) => s.selectedEdgeId);
  const selectTable = useUIStore((s) => s.selectTable);
  const selectEdge = useUIStore((s) => s.selectEdge);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Ignore shortcuts while typing
      if (isInput) return;

      const mod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + N: New table
      if (mod && e.key === 'n') {
        e.preventDefault();
        addTable();
        return;
      }

      // Cmd/Ctrl + Z: Undo · Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y: Redo
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      // Cmd/Ctrl + B: Toggle sidebar
      if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Cmd/Ctrl + D: Duplicate selected table
      if (mod && e.key.toLowerCase() === 'd') {
        if (selectedTableId) {
          e.preventDefault();
          duplicateTable(selectedTableId);
        }
        return;
      }

      // Arrow keys: nudge selected table (Shift = fine, 1px)
      if (selectedTableId && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? NUDGE_STEP_FINE : NUDGE_STEP;
        const deltas: Record<string, [number, number]> = {
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
        };
        const [dx, dy] = deltas[e.key];
        moveTable(selectedTableId, dx, dy);
        return;
      }

      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedTableId) {
          deleteTable(selectedTableId);
          selectTable(null);
        } else if (selectedEdgeId) {
          deleteEdge(selectedEdgeId);
        }
        return;
      }

      // Escape: deselect
      if (e.key === 'Escape') {
        selectTable(null);
        selectEdge(null);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addTable, deleteTable, deleteEdge, duplicateTable, moveTable, undo, redo, selectedTableId, selectedEdgeId, selectTable, selectEdge, toggleSidebar]);
}
