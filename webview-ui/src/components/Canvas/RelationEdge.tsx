import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { X, Link2 } from 'lucide-react';
import type { RelationEdge as RelationEdgeType, RelationType } from '@/types';
import { useDiagramStore, useUIStore } from '@/store';
import { cn } from '@/lib/utils';
import { dirVector } from '@/utils/edgeLanes';

/** How far straight out from the shared anchor before a fanned line starts nudging sideways. */
const FAN_LEAD = 12;
/** Perpendicular gap between adjacent lines in a fan. */
const FAN_SPACING = 6;

function fanOffset(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index - (count - 1) / 2) * FAN_SPACING;
}

function RelationEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<RelationEdgeType>) {
  const deleteEdge = useDiagramStore((s) => s.deleteEdge);
  const selectEdge = useUIStore((s) => s.selectEdge);

  const sourceFanCount = data?.sourceFanCount ?? 1;
  const targetFanCount = data?.targetFanCount ?? 1;
  const sOffset = fanOffset(data?.sourceFanIndex ?? 0, sourceFanCount);
  const tOffset = fanOffset(data?.targetFanIndex ?? 0, targetFanCount);

  // A column can carry more than one relation, and they all exit from that column's single
  // handle point — left as-is, their lines would be drawn stacked exactly on top of each
  // other. When this edge has siblings there (fan count > 1), run a short straight lead out
  // from the true point, then nudge sideways into this edge's own lane before handing off to
  // the normal step-path routing, so the bundle reads as a small fan instead of one line.
  const sDir = dirVector(sourcePosition);
  const tDir = dirVector(targetPosition);
  const sourceLead = { x: sourceX + sDir.x * FAN_LEAD, y: sourceY + sDir.y * FAN_LEAD };
  const effSourceX = sourceLead.x + (sDir.x === 0 ? sOffset : 0);
  const effSourceY = sourceLead.y + (sDir.x !== 0 ? sOffset : 0);
  const targetLead = { x: targetX + tDir.x * FAN_LEAD, y: targetY + tDir.y * FAN_LEAD };
  const effTargetX = targetLead.x + (tDir.x === 0 ? tOffset : 0);
  const effTargetY = targetLead.y + (tDir.x !== 0 ? tOffset : 0);

  // Relations that don't share an anchor can still land on the same default bend point —
  // e.g. several parents feeding one child column — and draw stacked on top of each other
  // over their shared Y range. Canvas pre-computes a lane offset (laneCenterX) for any
  // relation caught in that situation; passing it as centerX spreads the bend into its own
  // parallel lane instead of leaving the library to pick the same midpoint for all of them.
  const [smoothPath, labelX, labelY] = getSmoothStepPath({
    sourceX: effSourceX,
    sourceY: effSourceY,
    sourcePosition,
    targetX: effTargetX,
    targetY: effTargetY,
    targetPosition,
    borderRadius: 12,
    ...(data?.laneCenterX !== undefined && { centerX: data.laneCenterX }),
  });

  // Chain: true anchor -> straight lead -> fan lane, then the library's own step path (which
  // already starts exactly at the fan lane point, so the leading "M" it emits is a harmless
  // no-op), then the same lead/anchor pair in reverse on the target side.
  const edgePath =
    `M ${sourceX},${sourceY} L ${sourceLead.x},${sourceLead.y} L ${effSourceX},${effSourceY} ` +
    smoothPath +
    ` L ${targetLead.x},${targetLead.y} L ${targetX},${targetY}`;

  const cardinality = getCardinalityNotation(data?.type ?? 'one-to-many');
  const label = data?.label || data?.foreignKeyName || cardinality.label;

  // Edges that span 2+ columns pass behind intermediate nodes (SVG renders below HTML nodes).
  // For those, duplicate the path inside EdgeLabelRenderer which renders above nodes.
  const isLongEdge = Math.abs(targetX - sourceX) > 640;

  const dimmed = data?.dimmed ?? false;
  const highlighted = data?.highlighted ?? false;
  // "Active" = selected, or connected to the table currently hovered/selected elsewhere on the canvas.
  const isActive = selected || highlighted;

  const edgeStroke = isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))';
  const edgeStrokeWidth = selected ? 2.25 : highlighted ? 2 : 1.5;
  const edgeDash = data?.isIdentifying ? undefined : '6 4';
  const edgeOpacity = dimmed ? 0.12 : 1;

  // A lone relation keeps its cardinality mark right at the table border, like before. Once a
  // point has siblings, each fanned-out line needs its own mark in its own lane — otherwise
  // every relation sharing that point would draw its "one"/crow's-foot mark on top of the
  // others, or the single leftover mark wouldn't line up with any of the separated lines.
  const sourceMarkerX = sourceFanCount > 1 ? effSourceX : sourceX;
  const sourceMarkerY = sourceFanCount > 1 ? effSourceY : sourceY;
  const targetMarkerX = targetFanCount > 1 ? effTargetX : targetX;
  const targetMarkerY = targetFanCount > 1 ? effTargetY : targetY;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: edgeStroke,
          strokeWidth: edgeStrokeWidth,
          strokeDasharray: edgeDash,
          opacity: edgeOpacity,
          transition: 'opacity 150ms ease, stroke 150ms ease',
        }}
      />

      <EdgeLabelRenderer>
        {isLongEdge && (
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 1,
              height: 1,
              overflow: 'visible',
              pointerEvents: 'none',
              opacity: edgeOpacity,
            }}
          >
            <path
              d={edgePath}
              fill="none"
              stroke={edgeStroke}
              strokeWidth={edgeStrokeWidth}
              strokeDasharray={edgeDash}
            />
          </svg>
        )}

        {/* Cardinality markers rendered above HTML nodes to avoid z-order clipping */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 1,
            height: 1,
            overflow: 'visible',
            pointerEvents: 'none',
            opacity: edgeOpacity,
          }}
        >
          <CardinalityMarker
            x={sourceMarkerX}
            y={sourceMarkerY}
            position={sourcePosition}
            notation={cardinality.source}
            optional={data?.sourceOptional ?? true}
            selected={selected ?? false}
          />
          <CardinalityMarker
            x={targetMarkerX}
            y={targetMarkerY}
            position={targetPosition}
            notation={cardinality.target}
            optional={false}
            selected={selected ?? false}
          />
        </svg>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            opacity: edgeOpacity,
            transition: 'opacity 150ms ease',
          }}
          className="absolute pointer-events-auto flex items-center gap-1 group/label"
          onClick={(e) => {
            e.stopPropagation();
            selectEdge(id);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            selectEdge(id);
          }}
        >
          <button
            className={cn(
              'px-2 py-0.5 rounded-full text-[10px] font-mono tracking-tight border transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap',
              selected
                ? 'bg-primary text-primary-foreground border-primary shadow-md'
                : 'bg-card text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'
            )}
            title={label}
          >
            <Link2 className="w-3 h-3 flex-shrink-0" />
            <span className="font-semibold">{cardinality.label}</span>
            {/* FK name hides until the relation is active — keeps the canvas from turning into
                a wall of overlapping labels when many relations are visible at once. */}
            {data?.showLabel !== false && (
              <span className={cn(isActive ? 'inline' : 'hidden', 'group-hover/label:inline')}>· {label}</span>
            )}
          </button>
          {selected && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteEdge(id);
                selectEdge(null);
              }}
              className="ml-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90 transition-colors"
              title="Delete relation"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

interface CardinalityMarkerProps {
  x: number;
  y: number;
  position: string;
  notation: 'one' | 'many';
  /** Min cardinality: true draws a small circle further out on the line for "zero or ..."
   *  (optional participation); false leaves just the bar/crow's-foot for "exactly ..."
   *  (mandatory participation). Standard IE / crow's-foot notation. */
  optional: boolean;
  selected: boolean;
}

/** Distance from the node border where the cardinality symbol (bar or crow's-foot) touches. */
const TOUCH = 6;
/** How far the crow's-foot spreads before converging back to a point on the line. */
const SPAN = 16;
/** Gap between the cardinality symbol and the optionality circle beyond it. */
const CIRCLE_GAP = 6;
const CIRCLE_R = 4;

function CardinalityMarker({ x, y, position, notation, optional, selected }: CardinalityMarkerProps) {
  const stroke = selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))';
  const horizontal = position === 'left' || position === 'right';
  const dir = position === 'left' || position === 'top' ? -1 : 1;

  if (notation === 'one') {
    const barAt = TOUCH + 6;
    const circleAt = barAt + CIRCLE_GAP + CIRCLE_R;
    const bar = horizontal
      ? <line x1={x + dir * barAt} y1={y - 7} x2={x + dir * barAt} y2={y + 7} />
      : <line x1={x - 7} y1={y + dir * barAt} x2={x + 7} y2={y + dir * barAt} />;
    return (
      <g stroke={stroke} strokeWidth={1.7} fill="none">
        {bar}
        {optional && (
          horizontal
            ? <circle cx={x + dir * circleAt} cy={y} r={CIRCLE_R} fill="hsl(var(--background))" />
            : <circle cx={x} cy={y + dir * circleAt} r={CIRCLE_R} fill="hsl(var(--background))" />
        )}
      </g>
    );
  }

  // many — crow's foot: the three prongs splay out right at the entity (TOUCH from the node
  // border) and converge to a single point further out (TOUCH + SPAN), where the line
  // continues toward the other entity. (Not the reverse — three lines converging to a point
  // AT the table would read as an arrowhead pointing into it, not crow's-foot notation.)
  const footFar = TOUCH + SPAN;
  const circleAt = footFar + CIRCLE_GAP + CIRCLE_R;
  const foot = horizontal ? (
    <>
      <line x1={x + dir * TOUCH} y1={y - 7} x2={x + dir * footFar} y2={y} />
      <line x1={x + dir * TOUCH} y1={y} x2={x + dir * footFar} y2={y} />
      <line x1={x + dir * TOUCH} y1={y + 7} x2={x + dir * footFar} y2={y} />
    </>
  ) : (
    <>
      <line x1={x - 7} y1={y + dir * TOUCH} x2={x} y2={y + dir * footFar} />
      <line x1={x} y1={y + dir * TOUCH} x2={x} y2={y + dir * footFar} />
      <line x1={x + 7} y1={y + dir * TOUCH} x2={x} y2={y + dir * footFar} />
    </>
  );
  return (
    <g stroke={stroke} strokeWidth={1.7} fill="none">
      {foot}
      {optional && (
        horizontal
          ? <circle cx={x + dir * circleAt} cy={y} r={CIRCLE_R} fill="hsl(var(--background))" />
          : <circle cx={x} cy={y + dir * circleAt} r={CIRCLE_R} fill="hsl(var(--background))" />
      )}
    </g>
  );
}

function getCardinalityNotation(type: RelationType): { source: 'one' | 'many'; target: 'one' | 'many'; label: string } {
  switch (type) {
    case 'one-to-one':
      return { source: 'one', target: 'one', label: '1:1' };
    case 'one-to-many':
      return { source: 'one', target: 'many', label: '1:N' };
    case 'many-to-many':
      return { source: 'many', target: 'many', label: 'N:M' };
  }
}

export const RelationEdge = memo(RelationEdgeComponent);
