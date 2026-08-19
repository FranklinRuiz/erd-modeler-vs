import dagre from 'dagre';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import type {
  Diagram,
  TableNode,
  RelationEdge,
  Table,
  Column,
  RelationType,
  ReferentialAction,
  ValidationIssue,
} from '@/types';
import {
  createDiagram,
  createTable,
  createTableNode,
  createColumn,
  createRelationEdge,
  createForeignKeyColumn,
  createJunctionTable,
} from '@/utils/factories';
import { validateDiagram } from '@/utils/validation';
import { STORAGE_KEY, NODE_DEFAULT_WIDTH } from '@/constants';

interface HistorySnapshot {
  diagrams: Diagram[];
  activeDiagramId: string | null;
}

interface DiagramStore {
  diagrams: Diagram[];
  activeDiagramId: string | null;
  lastCreatedEdgeId: string | null;
  history: { past: HistorySnapshot[]; future: HistorySnapshot[] };

  undo: () => void;
  redo: () => void;
  moveTable: (tableId: string, dx: number, dy: number) => void;

  createNewDiagram: (name?: string) => void;
  clearLastCreatedEdgeId: () => void;
  selectDiagram: (id: string) => void;
  renameDiagram: (id: string, name: string) => void;
  deleteDiagram: (id: string) => void;
  duplicateDiagram: (id: string) => void;
  loadDiagram: (diagram: Diagram) => void;
  hydrateSingleDiagram: (diagram: Diagram) => void;
  getActiveDiagram: () => Diagram | null;
  validateActiveDiagram: () => ValidationIssue[];

  onNodesChange: (changes: NodeChange<TableNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<RelationEdge>[]) => void;
  onConnect: (connection: Connection) => void;

  addTable: (position?: { x: number; y: number }, name?: string) => void;
  updateTable: (tableId: string, updates: Partial<Table>) => void;
  deleteTable: (tableId: string) => void;
  duplicateTable: (tableId: string) => void;

  addColumn: (tableId: string) => void;
  updateColumn: (tableId: string, columnId: string, updates: Partial<Column>) => void;
  deleteColumn: (tableId: string, columnId: string) => void;
  reorderColumns: (tableId: string, fromIndex: number, toIndex: number) => void;

  createRelationshipBetweenTables: (sourceTableId: string, targetTableId: string, type?: RelationType) => void;
  updateRelation: (edgeId: string, updates: Partial<NonNullable<RelationEdge['data']>>) => void;
  updateRelationType: (edgeId: string, type: RelationType) => void;
  updateRelationColumns: (edgeId: string, sourceColumnId: string, targetColumnId: string) => void;
  deleteEdge: (edgeId: string) => void;
  convertManyToManyRelation: (edgeId: string) => void;

  autoLayout: () => void;
}

const initialDiagram = createDiagram('Physical ERD Model');

export const useDiagramStore = create<DiagramStore>()(
  devtools(
    persist(
      (set, get) => ({
        diagrams: [initialDiagram],
        activeDiagramId: initialDiagram.id,
        lastCreatedEdgeId: null,
        history: { past: [], future: [] },

        undo: () => set((state) => {
          const { past, future } = state.history;
          if (past.length === 0) return state;
          const previous = past[past.length - 1];
          const current: HistorySnapshot = { diagrams: state.diagrams, activeDiagramId: state.activeDiagramId };
          return {
            diagrams: previous.diagrams,
            activeDiagramId: previous.activeDiagramId,
            history: { past: past.slice(0, -1), future: [current, ...future].slice(0, MAX_HISTORY) },
          };
        }),

        redo: () => set((state) => {
          const { past, future } = state.history;
          if (future.length === 0) return state;
          const next = future[0];
          const current: HistorySnapshot = { diagrams: state.diagrams, activeDiagramId: state.activeDiagramId };
          return {
            diagrams: next.diagrams,
            activeDiagramId: next.activeDiagramId,
            history: { past: [...past, current].slice(-MAX_HISTORY), future: future.slice(1) },
          };
        }),

        moveTable: (tableId, dx, dy) => {
          set((state) => ({
            ...pushHistory(state, `moveTable:${tableId}`),
            ...updateActive(state, (d) => ({
              ...d,
              nodes: d.nodes.map((n) => n.id === tableId ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n),
            })),
          }));
        },

        clearLastCreatedEdgeId: () => set({ lastCreatedEdgeId: null }),

        createNewDiagram: (name = 'Untitled Diagram') => {
          const newDiagram = createDiagram(name);
          set((state) => ({
            diagrams: [...state.diagrams, newDiagram],
            activeDiagramId: newDiagram.id,
          }));
        },

        selectDiagram: (id) => set({ activeDiagramId: id }),

        renameDiagram: (id, name) =>
          set((state) => ({
            diagrams: state.diagrams.map((d) =>
              d.id === id ? { ...d, name, updatedAt: new Date().toISOString() } : d
            ),
          })),

        deleteDiagram: (id) =>
          set((state) => {
            const filtered = state.diagrams.filter((d) => d.id !== id);
            const next = filtered.length > 0 ? filtered : [createDiagram()];
            return {
              diagrams: next,
              activeDiagramId: state.activeDiagramId === id ? next[0].id : state.activeDiagramId,
            };
          }),

        duplicateDiagram: (id) =>
          set((state) => {
            const original = state.diagrams.find((d) => d.id === id);
            if (!original) return state;
            const copy: Diagram = {
              ...structuredClone(original),
              id: createDiagram().id,
              name: `${original.name} (copy)`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            return { diagrams: [...state.diagrams, copy] };
          }),

        loadDiagram: (diagram) =>
          set((state) => {
            const normalized = normalizeDiagram(diagram);
            const exists = state.diagrams.some((d) => d.id === normalized.id);
            const updated = exists
              ? state.diagrams.map((d) => (d.id === normalized.id ? normalized : d))
              : [...state.diagrams, normalized];
            return { diagrams: updated, activeDiagramId: normalized.id };
          }),

        // Full-state replace (not merge/append like `loadDiagram`) used only by the
        // VS Code bridge: one .asto file = one diagram = one custom editor tab, so
        // hydrating from a document's text must fully take over the store, not
        // accumulate alongside whatever was in it before.
        hydrateSingleDiagram: (diagram) =>
          set({
            diagrams: [normalizeDiagram(diagram)],
            activeDiagramId: diagram.id,
            lastCreatedEdgeId: null,
            history: { past: [], future: [] },
          }),

        getActiveDiagram: () => {
          const { diagrams, activeDiagramId } = get();
          return diagrams.find((d) => d.id === activeDiagramId) ?? null;
        },

        validateActiveDiagram: () => {
          const diagram = get().getActiveDiagram();
          return diagram ? validateDiagram(diagram) : [];
        },

        onNodesChange: (changes) => {
          set((state) => {
            const dragStart = changes.some((c) => c.type === 'position' && c.dragging === true);
            const dragEnd = changes.some((c) => c.type === 'position' && c.dragging === false);
            const removing = changes.some((c) => c.type === 'remove');
            let historyPatch: Partial<DiagramStore> = {};
            if (removing) {
              historyPatch = pushHistory(state, null);
            } else if (dragStart && !dragHistorySnapshotted) {
              dragHistorySnapshotted = true;
              historyPatch = pushHistory(state, null);
            }
            if (dragEnd) dragHistorySnapshotted = false;
            return {
              ...historyPatch,
              ...updateActive(state, (d) => ({
                ...d,
                nodes: applyNodeChanges(changes, d.nodes),
              })),
            };
          });
        },

        onEdgesChange: (changes) => {
          set((state) => {
            const removing = changes.some((c) => c.type === 'remove');
            return {
              ...(removing ? pushHistory(state, null) : {}),
              ...updateActive(state, (d) => ({
                ...d,
                edges: applyEdgeChanges(changes, d.edges),
              })),
            };
          });
        },

        onConnect: (connection) => {
          if (!connection.source || !connection.target) return;
          set((state) => {
            const historyPatch = pushHistory(state, null);
            const updated = updateActive(state, (d) => createRelationshipFromConnection(d, connection));
            if (!updated.diagrams) return { ...historyPatch, ...updated };
            const active = updated.diagrams.find((d) => d.id === state.activeDiagramId);
            const lastEdge = active?.edges[active.edges.length - 1];
            return { ...historyPatch, ...updated, lastCreatedEdgeId: lastEdge?.id ?? null };
          });
        },

        addTable: (position, name) => {
          set((state) => ({
            ...pushHistory(state, null),
            ...updateActive(state, (d) => {
              const table = createTable(name ?? `table_${d.nodes.length + 1}`, d.nodes.length);
              const node = createTableNode(table, snap(position ?? randomPosition(), d.settings.gridSize));
              return { ...d, nodes: [...d.nodes, node] };
            }),
          }));
        },

        updateTable: (tableId, updates) => {
          set((state) => ({
            ...pushHistory(state, `updateTable:${tableId}`),
            ...updateActive(state, (d) => ({
              ...d,
              nodes: d.nodes.map((n) =>
                n.id === tableId
                  ? { ...n, data: { ...n.data, table: { ...n.data.table, ...updates } } }
                  : n
              ),
            })),
          }));
        },

        deleteTable: (tableId) => {
          set((state) => ({
            ...pushHistory(state, null),
            ...updateActive(state, (d) => ({
              ...d,
              nodes: d.nodes.filter((n) => n.id !== tableId),
              edges: d.edges.filter((e) => e.source !== tableId && e.target !== tableId),
            })),
          }));
        },

        duplicateTable: (tableId) => {
          set((state) => ({
            ...pushHistory(state, null),
            ...updateActive(state, (d) => {
              const node = d.nodes.find((n) => n.id === tableId);
              if (!node) return d;
              const newTable = createTable(`${node.data.table.name}_copy`, d.nodes.length, node.data.table.schema);
              newTable.color = node.data.table.color;
              newTable.columns = node.data.table.columns.map((c) => ({ ...createColumn(), ...c, id: createColumn().id }));
              const newNode = createTableNode(newTable, {
                x: node.position.x + 48,
                y: node.position.y + 48,
              });
              return { ...d, nodes: [...d.nodes, newNode] };
            }),
          }));
        },

        addColumn: (tableId) => {
          set((state) => ({
            ...pushHistory(state, null),
            ...updateActive(state, (d) => ({
              ...d,
              nodes: d.nodes.map((n) =>
                n.id === tableId
                  ? { ...n, data: { ...n.data, table: { ...n.data.table, columns: [...n.data.table.columns, createColumn()] } } }
                  : n
              ),
            })),
          }));
        },

        updateColumn: (tableId, columnId, updates) => {
          set((state) => ({
            ...pushHistory(state, `updateColumn:${columnId}`),
            ...updateActive(state, (d) => ({
              ...d,
              nodes: d.nodes.map((n) =>
                n.id === tableId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        table: {
                          ...n.data.table,
                          columns: n.data.table.columns.map((c) =>
                            c.id === columnId
                              ? normalizeColumn({ ...c, ...updates })
                              : c
                          ),
                        },
                      },
                    }
                  : n
              ),
            })),
          }));
        },

        deleteColumn: (tableId, columnId) => {
          set((state) => ({
            ...pushHistory(state, null),
            ...updateActive(state, (d) => ({
              ...d,
              nodes: d.nodes.map((n) =>
                n.id === tableId
                  ? { ...n, data: { ...n.data, table: { ...n.data.table, columns: n.data.table.columns.filter((c) => c.id !== columnId) } } }
                  : n
              ),
              edges: d.edges.filter((e) => e.data?.sourceColumnId !== columnId && e.data?.targetColumnId !== columnId),
            })),
          }));
        },

        reorderColumns: (tableId, fromIndex, toIndex) => {
          set((state) => ({
            ...pushHistory(state, null),
            ...updateActive(state, (d) => ({
              ...d,
              nodes: d.nodes.map((n) => {
                if (n.id !== tableId) return n;
                const columns = [...n.data.table.columns];
                const [moved] = columns.splice(fromIndex, 1);
                columns.splice(toIndex, 0, moved);
                return { ...n, data: { ...n.data, table: { ...n.data.table, columns } } };
              }),
            })),
          }));
        },

        createRelationshipBetweenTables: (sourceTableId, targetTableId, type = 'one-to-many') => {
          set((state) => ({
            ...pushHistory(state, null),
            ...updateActive(state, (d) => createRelationshipBetweenTables(d, sourceTableId, targetTableId, type)),
          }));
        },

        updateRelation: (edgeId, updates) => {
          set((state) => ({
            ...pushHistory(state, `updateRelation:${edgeId}`),
            ...updateActive(state, (d) => ({
              ...d,
              edges: d.edges.map((e) => e.id === edgeId && e.data ? { ...e, data: { ...e.data, ...updates } } : e),
            })),
          }));
        },

        updateRelationType: (edgeId, type) => {
          if (type === 'many-to-many') {
            get().convertManyToManyRelation(edgeId);
            return;
          }
          set((state) => ({
            ...pushHistory(state, null),
            ...updateActive(state, (d) => ({
              ...d,
              edges: d.edges.map((e) => e.id === edgeId && e.data ? { ...e, data: { ...e.data, type } } : e),
            })),
          }));
        },

        updateRelationColumns: (edgeId, sourceColumnId, targetColumnId) => {
          set((state) => ({
            ...pushHistory(state, null),
            ...updateActive(state, (d) => ({
              ...d,
              edges: d.edges.map((e) => e.id === edgeId && e.data
                ? {
                    ...e,
                    sourceHandle: `${sourceColumnId}-source`,
                    targetHandle: `${targetColumnId}-target`,
                    data: { ...e.data, sourceColumnId, targetColumnId },
                  }
                : e),
            })),
          }));
        },

        deleteEdge: (edgeId) => {
          set((state) => ({
            ...pushHistory(state, null),
            ...updateActive(state, (d) => ({ ...d, edges: d.edges.filter((e) => e.id !== edgeId) })),
          }));
        },

        convertManyToManyRelation: (edgeId) => {
          set((state) => ({
            ...pushHistory(state, null),
            ...updateActive(state, (d) => convertEdgeToJunctionTable(d, edgeId)),
          }));
        },

        autoLayout: () => {
          set((state) => ({
            ...pushHistory(state, null),
            ...updateActive(state, (d) => hierarchicalAutoLayout(d)),
          }));
        },
      }),
      {
        name: STORAGE_KEY,
        version: 2,
        partialize: (state) => ({
          diagrams: state.diagrams,
          activeDiagramId: state.activeDiagramId,
        }),
      }
    ),
    { name: 'DiagramStore' }
  )
);

const MAX_HISTORY = 100;
const COALESCE_MS = 600;
let lastActionKey: string | null = null;
let lastActionTime = 0;
let dragHistorySnapshotted = false;

/**
 * Snapshots pre-mutation state onto the undo stack. Repeated calls with the same
 * non-null `key` within COALESCE_MS are merged into a single undo step — this keeps
 * fast keystrokes in a text field (name, comment, FK label) from producing one
 * undo entry per character.
 */
function pushHistory(state: DiagramStore, key: string | null): Partial<DiagramStore> {
  const now = Date.now();
  const coalesce = key !== null && key === lastActionKey && now - lastActionTime < COALESCE_MS;
  lastActionKey = key;
  lastActionTime = now;
  if (coalesce) return {};
  return {
    history: {
      past: [...state.history.past, { diagrams: state.diagrams, activeDiagramId: state.activeDiagramId }].slice(-MAX_HISTORY),
      future: [],
    },
  };
}

function updateActive(state: DiagramStore, mutator: (d: Diagram) => Diagram): Partial<DiagramStore> {
  if (!state.activeDiagramId) return {};
  return {
    diagrams: state.diagrams.map((d) =>
      d.id === state.activeDiagramId
        ? { ...mutator(normalizeDiagram(d)), updatedAt: new Date().toISOString() }
        : normalizeDiagram(d)
    ),
  };
}

function createRelationshipFromConnection(diagram: Diagram, connection: Connection): Diagram {
  if (!connection.source || !connection.target) return diagram;

  // Resolve source column: validate handle maps to a real column (handles "header-source" and table-level IDs).
  // Column handles carry a "-left"/"-right" side suffix (for direction-aware rendering) that isn't part of the id.
  const rawSourceId = connection.sourceHandle?.replace(/-source(-left|-right)?$/, '');
  const sourceColumn = rawSourceId ? getColumn(diagram, connection.source, rawSourceId) : undefined;
  const sourceColumnId = sourceColumn?.id ?? primaryKeyOf(diagram, connection.source)?.id;
  if (!sourceColumnId) return diagram;

  // Resolve target column: may be undefined if user dropped on table-level handle (auto-creates FK)
  const rawTargetId = connection.targetHandle?.replace(/-target(-left|-right)?$/, '');
  const targetColumn = rawTargetId ? getColumn(diagram, connection.target, rawTargetId) : undefined;

  // Auto-detect reversed direction: user dragged FROM a non-PK column TO a PK column.
  // e.g. bie_user.status_id → status.status_id  (the FK already exists in the source table)
  // Treat the target's PK as the parent and the source's column as the existing FK — no new column needed.
  if (targetColumn?.isPrimaryKey && sourceColumn && !sourceColumn.isPrimaryKey) {
    return linkExistingForeignKey(
      diagram,
      connection.target, // parent table (owns the PK)
      targetColumn.id,   // parent PK column
      connection.source, // child table (already has the FK column)
      sourceColumn.id,   // child's existing FK column
    );
  }

  return createRelationshipBetweenTables(diagram, connection.source, connection.target, 'one-to-many', sourceColumnId, targetColumn?.id);
}

/**
 * Creates a relation using an already-existing column as the FK.
 * The column is updated in-place (marked isForeignKey + references set).
 * No new column is added to either table.
 */
function linkExistingForeignKey(
  diagram: Diagram,
  parentTableId: string,
  parentColumnId: string,
  childTableId: string,
  childColumnId: string,
): Diagram {
  const parentNode = diagram.nodes.find((n) => n.id === parentTableId);
  const childNode  = diagram.nodes.find((n) => n.id === childTableId);
  if (!parentNode || !childNode) return diagram;

  const parentColumn = getColumn(diagram, parentTableId, parentColumnId);
  const childColumn  = getColumn(diagram, childTableId, childColumnId);
  if (!parentColumn || !childColumn) return diagram;

  const updatedChild = normalizeColumn({
    ...childColumn,
    type: parentColumn.type, // sync type to match parent PK
    isForeignKey: true,
    references: { tableId: parentTableId, columnId: parentColumnId },
  });

  const label = `fk_${childNode.data.table.name}_${parentNode.data.table.name}_${updatedChild.name}`;
  const edge = createRelationEdge(parentTableId, parentColumnId, childTableId, childColumnId, 'one-to-many', {
    label,
    foreignKeyName: label,
    onDelete: updatedChild.isNullable ? 'SET NULL' : 'NO ACTION',
    onUpdate: 'CASCADE',
  });

  return {
    ...diagram,
    nodes: diagram.nodes.map((node) =>
      node.id === childTableId
        ? {
            ...node,
            data: {
              ...node.data,
              table: {
                ...node.data.table,
                columns: node.data.table.columns.map((c) => (c.id === childColumnId ? updatedChild : c)),
              },
            },
          }
        : node
    ),
    edges: [...diagram.edges, edge],
  };
}

function createRelationshipBetweenTables(
  diagram: Diagram,
  sourceTableId: string,
  targetTableId: string,
  type: RelationType,
  sourceColumnId?: string,
  preferredTargetColumnId?: string
): Diagram {
  if (sourceTableId === targetTableId) return diagram;
  const sourceNode = diagram.nodes.find((n) => n.id === sourceTableId);
  const targetNode = diagram.nodes.find((n) => n.id === targetTableId);
  if (!sourceNode || !targetNode) return diagram;

  const sourceTable = sourceNode.data.table;
  const targetTable = targetNode.data.table;
  const sourcePk = sourceColumnId
    ? sourceTable.columns.find((c) => c.id === sourceColumnId)
    : primaryKey(sourceTable);
  if (!sourcePk) return diagram;

  if (type === 'many-to-many') {
    const edge = createRelationEdge(sourceTable.id, sourcePk.id, targetTable.id, primaryKey(targetTable)?.id ?? targetTable.columns[0]?.id, 'many-to-many');
    return convertEdgeToJunctionTable({ ...diagram, edges: [...diagram.edges, edge] }, edge.id);
  }

  let targetColumns = [...targetTable.columns];

  // When the user explicitly dragged to a specific non-PK column, use that column as-is
  // (update its FK properties). Only auto-create a new column when no explicit target was given.
  const explicitTarget = preferredTargetColumnId
    ? targetColumns.find((c) => c.id === preferredTargetColumnId && !c.isPrimaryKey)
    : undefined;

  let targetColumn: Column;

  if (explicitTarget) {
    targetColumn = normalizeColumn({
      ...explicitTarget,
      type: sourcePk.type,
      isForeignKey: true,
      isNullable: type === 'one-to-one' ? false : explicitTarget.isNullable,
      isUnique: type === 'one-to-one' ? true : explicitTarget.isUnique,
      references: { tableId: sourceTable.id, columnId: sourcePk.id },
    });
  } else {
    targetColumn = createForeignKeyColumn(sourceTable, sourcePk);
    targetColumns = [...targetColumns, targetColumn];
  }

  const label = `fk_${targetTable.name}_${sourceTable.name}_${targetColumn.name}`;
  const edge = createRelationEdge(sourceTable.id, sourcePk.id, targetTable.id, targetColumn.id, type, {
    label,
    foreignKeyName: label,
    onDelete: targetColumn.isNullable ? 'SET NULL' : 'NO ACTION',
    onUpdate: 'CASCADE',
  });

  return {
    ...diagram,
    nodes: diagram.nodes.map((node) =>
      node.id === targetTable.id
        ? { ...node, data: { ...node.data, table: { ...targetTable, columns: targetColumns } } }
        : node
    ),
    edges: [...diagram.edges, edge],
  };
}

function convertEdgeToJunctionTable(diagram: Diagram, edgeId: string): Diagram {
  const edge = diagram.edges.find((e) => e.id === edgeId);
  if (!edge?.data) return diagram;
  const leftNode = diagram.nodes.find((node) => node.id === edge.source);
  const rightNode = diagram.nodes.find((node) => node.id === edge.target);
  if (!leftNode || !rightNode) return diagram;
  const leftPk = leftNode.data.table.columns.find((column) => column.id === edge.data!.sourceColumnId) ?? primaryKey(leftNode.data.table);
  const rightPk = rightNode.data.table.columns.find((column) => column.id === edge.data!.targetColumnId) ?? primaryKey(rightNode.data.table);
  if (!leftPk || !rightPk) return diagram;

  const junctionTable = createJunctionTable(leftNode.data.table, leftPk, rightNode.data.table, rightPk, diagram.nodes.length);
  const junctionNode = createTableNode(junctionTable, {
    x: (leftNode.position.x + rightNode.position.x) / 2,
    y: (leftNode.position.y + rightNode.position.y) / 2 + 180,
  });
  const [leftFk, rightFk] = junctionTable.columns;
  const leftLabel = `fk_${junctionTable.name}_${leftNode.data.table.name}_${leftFk.name}`;
  const rightLabel = `fk_${junctionTable.name}_${rightNode.data.table.name}_${rightFk.name}`;
  const leftEdge = createRelationEdge(leftNode.id, leftPk.id, junctionTable.id, leftFk.id, 'one-to-many', {
    label: leftLabel,
    foreignKeyName: leftLabel,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  const rightEdge = createRelationEdge(rightNode.id, rightPk.id, junctionTable.id, rightFk.id, 'one-to-many', {
    label: rightLabel,
    foreignKeyName: rightLabel,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });

  return {
    ...diagram,
    nodes: [...diagram.nodes, junctionNode],
    edges: diagram.edges.filter((item) => item.id !== edgeId).concat(leftEdge, rightEdge),
  };
}

function primaryKeyOf(diagram: Diagram, tableId: string): Column | undefined {
  return primaryKey(diagram.nodes.find((node) => node.id === tableId)?.data.table);
}

function primaryKey(table?: Table): Column | undefined {
  return table?.columns.find((column) => column.isPrimaryKey) ?? table?.columns[0];
}

function getColumn(diagram: Diagram, tableId: string, columnId: string): Column | undefined {
  return diagram.nodes.find((node) => node.id === tableId)?.data.table.columns.find((column) => column.id === columnId);
}

function normalizeColumn(column: Column): Column {
  return {
    ...column,
    isNullable: column.isPrimaryKey ? false : column.isNullable,
    isUnique: column.isPrimaryKey ? true : column.isUnique,
    isAutoIncrement: column.isAutoIncrement && ['INT', 'BIGINT', 'SMALLINT', 'TINYINT'].includes(column.type),
  };
}

function normalizeDiagram(diagram: Diagram): Diagram {
  return {
    ...diagram,
    settings: diagram.settings ?? {
      showDataTypes: true,
      showConstraints: true,
      showRelationLabels: true,
      showForeignKeyColumns: true,
      snapToGrid: true,
      gridSize: 20,
    },
  };
}

function randomPosition() {
  return { x: 120 + Math.random() * 320, y: 120 + Math.random() * 220 };
}

function snap(position: { x: number; y: number }, gridSize: number) {
  return {
    x: Math.round(position.x / gridSize) * gridSize,
    y: Math.round(position.y / gridSize) * gridSize,
  };
}

function hierarchicalAutoLayout(diagram: Diagram): Diagram {
  const { nodes, edges } = diagram;
  if (nodes.length === 0) return diagram;

  const NODE_W = 320;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const nodeH = (id: string) => 56 + (nodeMap.get(id)?.data.table.columns.length ?? 4) * 30;
  const gridSize = diagram.settings?.gridSize ?? 20;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',
    ranksep: 380, // horizontal gap between rank columns — leaves room for edge labels
    nodesep: 90,  // vertical gap between nodes in the same rank column — keeps hub tables from packing edges into a tight corridor
    edgesep: 40,  // spread for edges that share a rank crossing — fans out parallel long relations instead of bunching them
    marginx: 80,
    marginy: 80,
  });

  nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: nodeH(n.id) }));
  edges.forEach(e => { if (e.source !== e.target) g.setEdge(e.source, e.target); });

  dagre.layout(g);

  // Dagre returns node centres; React Flow uses top-left corner.
  return {
    ...diagram,
    nodes: nodes.map(n => {
      const { x, y } = g.node(n.id);
      return { ...n, position: snap({ x: x - NODE_W / 2, y: y - nodeH(n.id) / 2 }, gridSize) };
    }),
  };
}
