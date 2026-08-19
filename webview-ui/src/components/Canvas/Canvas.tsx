import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  type NodeTypes,
  type EdgeTypes,
  type OnSelectionChangeParams,
  ConnectionLineType,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { TableNode } from './TableNode';
import { RelationEdge } from './RelationEdge';
import { useDiagramStore, useUIStore } from '@/store';
import type { RelationEdge as RelationEdgeType } from '@/types';
import { DEFAULT_VIEWPORT } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { getTableValidationLevel } from '@/utils/validation';
import { registerFlowInstance } from '@/utils/flowInstance';

const nodeTypes: NodeTypes = { tableNode: TableNode };
const edgeTypes: EdgeTypes = { relationEdge: RelationEdge };

export function Canvas() {
  const theme = useTheme();
  const { fitView, getViewport, setViewport } = useReactFlow();

  useEffect(() => {
    registerFlowInstance({ fitView, getViewport, setViewport });
  }, [fitView, getViewport, setViewport]);

  const activeDiagram = useDiagramStore((s) => s.diagrams.find((d) => d.id === s.activeDiagramId));
  const onNodesChange = useDiagramStore((s) => s.onNodesChange);
  const onEdgesChange = useDiagramStore((s) => s.onEdgesChange);
  const onConnect = useDiagramStore((s) => s.onConnect);
  const selectTable = useUIStore((s) => s.selectTable);
  const selectEdge = useUIStore((s) => s.selectEdge);
  const setSelectedTableIds = useUIStore((s) => s.setSelectedTableIds);
  const selectedTableId = useUIStore((s) => s.selectedTableId);
  const selectedTableIds = useUIStore((s) => s.selectedTableIds);
  const hoveredTableId = useUIStore((s) => s.hoveredTableId);
  const setHoveredTableId = useUIStore((s) => s.setHoveredTableId);

  const handleSelectionChange = useCallback(
    ({ nodes, edges }: OnSelectionChangeParams) => {
      setSelectedTableIds(nodes.map((n) => n.id));
      if (nodes.length > 0) {
        selectTable(nodes[0].id);
      } else if (edges.length > 0) {
        selectEdge(edges[0].id);
      } else {
        selectTable(null);
        selectEdge(null);
      }
    },
    [selectTable, selectEdge, setSelectedTableIds]
  );

  const handlePaneClick = useCallback(() => {
    selectTable(null);
    selectEdge(null);
    setSelectedTableIds([]);
  }, [selectTable, selectEdge, setSelectedTableIds]);

  const handleNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: Node) => setHoveredTableId(node.id),
    [setHoveredTableId]
  );
  const handleNodeMouseLeave = useCallback(() => setHoveredTableId(null), [setHoveredTableId]);

  // Focus id: whatever the user is currently hovering, falling back to a single selected table.
  const focusTableId =
    hoveredTableId ?? (selectedTableIds.length <= 1 ? selectedTableId : null);

  const rawEdges = activeDiagram?.edges ?? [];

  const { connectedNodeIds, connectedEdgeIds } = useMemo(() => {
    if (!focusTableId) return { connectedNodeIds: null, connectedEdgeIds: null };
    const nodeIds = new Set<string>([focusTableId]);
    const edgeIds = new Set<string>();
    for (const edge of rawEdges) {
      if (edge.source === focusTableId || edge.target === focusTableId) {
        edgeIds.add(edge.id);
        nodeIds.add(edge.source);
        nodeIds.add(edge.target);
      }
    }
    return { connectedNodeIds: nodeIds, connectedEdgeIds: edgeIds };
  }, [focusTableId, rawEdges]);

  const nodes = useMemo(() => {
    if (!activeDiagram) return [];
    return activeDiagram.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        validationLevel: getTableValidationLevel(activeDiagram, node.id),
        dimmed: connectedNodeIds ? !connectedNodeIds.has(node.id) : false,
      },
    }));
  }, [activeDiagram, connectedNodeIds]);

  const nodePositionById = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of activeDiagram?.nodes ?? []) {
      map.set(node.id, node.position.x + (node.measured?.width ?? 170));
    }
    return map;
  }, [activeDiagram]);

  const nodeCenterYById = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of activeDiagram?.nodes ?? []) {
      map.set(node.id, node.position.y + (node.measured?.height ?? 100) / 2);
    }
    return map;
  }, [activeDiagram]);

  // `${tableId} ${columnId}` -> isNullable, so the "one" cardinality mark near the parent can
  // show the correct min-cardinality (a mandatory-vs-optional circle) based on whether the
  // child's actual FK column is nullable, instead of always assuming mandatory.
  const columnNullableById = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const node of activeDiagram?.nodes ?? []) {
      for (const column of node.data.table.columns) {
        map.set(`${node.id} ${column.id}`, column.isNullable);
      }
    }
    return map;
  }, [activeDiagram]);

  // A column can carry more than one relation on the same side (e.g. a PK referenced by
  // several FKs) — they all exit from that column's single handle point. Group edges by
  // (table, column, side) and rank each one by the vertical position of the table it connects
  // to (the relation pointing to whichever table sits higher gets rank 0). RelationEdge uses
  // this rank to fan the lines apart visually right after they leave the shared point, instead
  // of drawing them stacked directly on top of each other.
  const fanAssignment = useMemo(() => {
    const fanByEdge = new Map<string, { sourceIndex: number; sourceCount: number; targetIndex: number; targetCount: number }>();
    const forwardByEdge = new Map<string, boolean>();

    const groups = new Map<string, { edgeId: string; otherY: number }[]>();
    const groupKey = (tableId: string, columnId: string, kind: string) => `${tableId} ${columnId} ${kind}`;

    for (const edge of rawEdges) {
      const sourceX = nodePositionById.get(edge.source) ?? 0;
      const targetX = nodePositionById.get(edge.target) ?? 0;
      const forward = targetX >= sourceX;
      forwardByEdge.set(edge.id, forward);
      const sourceKind = forward ? 'source-right' : 'source-left';
      const targetKind = forward ? 'target-left' : 'target-right';
      const sourceColumnId = edge.data?.sourceColumnId;
      const targetColumnId = edge.data?.targetColumnId;
      if (sourceColumnId) {
        const key = groupKey(edge.source, sourceColumnId, sourceKind);
        const arr = groups.get(key) ?? [];
        arr.push({ edgeId: edge.id, otherY: nodeCenterYById.get(edge.target) ?? 0 });
        groups.set(key, arr);
      }
      if (targetColumnId) {
        const key = groupKey(edge.target, targetColumnId, targetKind);
        const arr = groups.get(key) ?? [];
        arr.push({ edgeId: edge.id, otherY: nodeCenterYById.get(edge.source) ?? 0 });
        groups.set(key, arr);
      }
    }

    const orderedIds = new Map<string, string[]>();
    for (const [key, arr] of groups) {
      const sorted = [...arr].sort((a, b) => a.otherY - b.otherY || a.edgeId.localeCompare(b.edgeId));
      orderedIds.set(key, sorted.map((e) => e.edgeId));
    }

    for (const edge of rawEdges) {
      const forward = forwardByEdge.get(edge.id) ?? true;
      const sourceKind = forward ? 'source-right' : 'source-left';
      const targetKind = forward ? 'target-left' : 'target-right';
      const sourceColumnId = edge.data?.sourceColumnId;
      const targetColumnId = edge.data?.targetColumnId;

      const sourceIds = sourceColumnId ? orderedIds.get(groupKey(edge.source, sourceColumnId, sourceKind)) : undefined;
      const targetIds = targetColumnId ? orderedIds.get(groupKey(edge.target, targetColumnId, targetKind)) : undefined;

      fanByEdge.set(edge.id, {
        sourceIndex: sourceIds?.indexOf(edge.id) ?? 0,
        sourceCount: sourceIds?.length ?? 1,
        targetIndex: targetIds?.indexOf(edge.id) ?? 0,
        targetCount: targetIds?.length ?? 1,
      });
    }

    return { fanByEdge, forwardByEdge };
  }, [rawEdges, nodePositionById, nodeCenterYById]);

  const edges = useMemo((): RelationEdgeType[] => {
    return rawEdges.map((edge) => {
      // Direction-aware handle side: exit/enter whichever side actually faces the other
      // table post-layout, instead of always right→left. Cuts the long way-around routes
      // that show up when auto-layout (or manual dragging) leaves a target table to the left
      // of its source — Navicat-style "closest side" connectors instead of a fixed direction.
      const forward = fanAssignment.forwardByEdge.get(edge.id) ?? true;
      const fan = fanAssignment.fanByEdge.get(edge.id);
      const sourceColumnId = edge.data?.sourceColumnId;
      const targetColumnId = edge.data?.targetColumnId;

      // The "one" mark near the parent (source) reflects whether the child's own FK column
      // (target side) is nullable — nullable means a child row can exist without a parent, so
      // that end is optional (0 or 1) rather than strictly mandatory (exactly 1).
      const sourceOptional = targetColumnId
        ? columnNullableById.get(`${edge.target} ${targetColumnId}`) ?? true
        : true;

      return {
        ...edge,
        ...(sourceColumnId && { sourceHandle: `${sourceColumnId}-source-${forward ? 'right' : 'left'}` }),
        ...(targetColumnId && { targetHandle: `${targetColumnId}-target-${forward ? 'left' : 'right'}` }),
        data: {
          ...edge.data,
          dimmed: connectedEdgeIds ? !connectedEdgeIds.has(edge.id) : false,
          highlighted: connectedEdgeIds ? connectedEdgeIds.has(edge.id) && !!focusTableId : false,
          sourceFanIndex: fan?.sourceIndex ?? 0,
          sourceFanCount: fan?.sourceCount ?? 1,
          targetFanIndex: fan?.targetIndex ?? 0,
          targetFanCount: fan?.targetCount ?? 1,
          sourceOptional,
        } as RelationEdgeType['data'],
      };
    });
  }, [rawEdges, connectedEdgeIds, focusTableId, fanAssignment, columnNullableById]);

  const settings = activeDiagram?.settings;

  return (
    <div className="w-full h-full grain">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={handleSelectionChange}
        onPaneClick={handlePaneClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        defaultViewport={DEFAULT_VIEWPORT}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionRadius={48}
        snapToGrid={settings?.snapToGrid ?? true}
        snapGrid={[settings?.gridSize ?? 20, settings?.gridSize ?? 20]}
        fitView={nodes.length > 0}
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.15}
        maxZoom={2.5}
        defaultEdgeOptions={{ type: 'relationEdge' }}
        connectionLineStyle={{
          stroke: 'hsl(var(--primary))',
          strokeWidth: 2.5,
          strokeDasharray: '8 4',
          opacity: 0.85,
        }}
      >
        <Background
          variant={BackgroundVariant.Lines}
          gap={settings?.gridSize ?? 20}
          size={1}
          color={theme === 'dark' ? '#2a2d35' : '#e5e7eb'}
        />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          nodeColor={(node) => {
            const tn = node as typeof nodes[number];
            return tn.data?.table?.color ?? 'hsl(var(--muted-foreground))';
          }}
          maskColor={theme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)'}
          style={{ backgroundColor: theme === 'dark' ? '#0f1115' : '#ffffff' }}
        />
      </ReactFlow>
    </div>
  );
}
