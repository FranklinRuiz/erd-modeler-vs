import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Key,
  Link2,
  Hash,
  GripVertical,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CircleAlert,
  Table2,
  Check,
  ArrowDown,
} from 'lucide-react';
import { Input } from '@/components/UI/input';
import { Button } from '@/components/UI/button';
import { Switch } from '@/components/UI/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/UI/select';
import { toast } from 'sonner';
import { useDiagramStore, useUIStore } from '@/store';
import { REFERENTIAL_ACTIONS, type Column, type RelationType, type ReferentialAction } from '@/types';
import { TABLE_COLORS } from '@/constants';
import { cn } from '@/lib/utils';

const BASE_TYPES = [
  'INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'BIT',
  'DECIMAL', 'NUMERIC', 'MONEY', 'SMALLMONEY', 'FLOAT', 'REAL',
  'NVARCHAR', 'VARCHAR', 'CHAR', 'NCHAR',
  'DATE', 'TIME', 'DATETIME', 'DATETIME2', 'SMALLDATETIME', 'DATETIMEOFFSET',
  'UNIQUEIDENTIFIER', 'XML', 'VARBINARY', 'BINARY',
  'TEXT', 'NTEXT', 'IMAGE', 'SQL_VARIANT', 'HIERARCHYID', 'GEOMETRY', 'GEOGRAPHY',
];

// SQL Server only allows IDENTITY on an integer primary key column.
const AUTO_INCREMENT_TYPES = new Set(['INT', 'BIGINT', 'SMALLINT', 'TINYINT']);

const PARAM_TYPES = new Set([
  'NVARCHAR', 'VARCHAR', 'CHAR', 'NCHAR',
  'DECIMAL', 'NUMERIC', 'FLOAT',
  'VARBINARY', 'BINARY',
  'TIME', 'DATETIME2', 'DATETIMEOFFSET',
]);

function parseTypeParam(type: string): { base: string; param: string } {
  const m = type.match(/^([A-Z_]+)\((.+)\)$/i);
  if (m) return { base: m[1].toUpperCase(), param: m[2] };
  return { base: type.toUpperCase().split('(')[0].trim(), param: '' };
}

/** Catches precision/scale/length mistakes that SQL Server only rejects at CREATE TABLE time
 *  (e.g. TIME(9), DECIMAL(5,10)) or a typo that isn't even a number (e.g. TIME(o)) — before now
 *  this field accepted anything and just concatenated it straight into the column type. */
function validateTypeParam(base: string, raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (base === 'TIME' || base === 'DATETIME2' || base === 'DATETIMEOFFSET') {
    if (!/^\d+$/.test(trimmed) || Number(trimmed) > 7) {
      return `${base}(n) requires a whole number between 0 and 7`;
    }
    return null;
  }

  if (base === 'FLOAT') {
    const n = Number(trimmed);
    if (!/^\d+$/.test(trimmed) || n < 1 || n > 53) {
      return 'FLOAT(n) requires a whole number between 1 and 53';
    }
    return null;
  }

  if (base === 'DECIMAL' || base === 'NUMERIC') {
    const m = trimmed.match(/^(\d+)(?:,(\d+))?$/);
    if (!m) return `${base}(precision, scale) requires numbers, e.g. 10,2`;
    const precision = Number(m[1]);
    const scale = m[2] !== undefined ? Number(m[2]) : 0;
    if (precision < 1 || precision > 38) return 'Precision must be between 1 and 38';
    if (scale > precision) return `Scale can't be greater than the precision (${precision})`;
    return null;
  }

  if (base === 'VARCHAR' || base === 'NVARCHAR' || base === 'VARBINARY') {
    if (/^max$/i.test(trimmed)) return null;
    if (!/^\d+$/.test(trimmed) || Number(trimmed) < 1) return `${base}(n) requires a positive whole number or MAX`;
    return null;
  }

  if (base === 'CHAR' || base === 'NCHAR' || base === 'BINARY') {
    if (!/^\d+$/.test(trimmed) || Number(trimmed) < 1) return `${base}(n) requires a positive whole number`;
    return null;
  }

  return null;
}

// Mirrors the 0.2s slide-out-right animation duration so unmount waits for it to finish.
const CLOSE_ANIMATION_MS = 200;

export function PropertiesPanel() {
  const isOpen = useUIStore((s) => s.isPropertiesOpen);
  const setOpen = useUIStore((s) => s.setPropertiesOpen);
  const selectedTableId = useUIStore((s) => s.selectedTableId);
  const selectedEdgeId = useUIStore((s) => s.selectedEdgeId);
  const selectTable = useUIStore((s) => s.selectTable);
  const selectEdge = useUIStore((s) => s.selectEdge);

  // Keeps the panel mounted for one extra tick after isOpen flips false, so the
  // slide-out animation gets to play instead of the panel just disappearing.
  const [rendered, setRendered] = useState(isOpen);
  useEffect(() => {
    if (isOpen) {
      setRendered(true);
    } else {
      const timer = setTimeout(() => setRendered(false), CLOSE_ANIMATION_MS);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // handleClose clears the selection in the same update that closes the panel, which
  // would otherwise flip the still-animating-out panel to the Validation view for the
  // closing animation's duration. Freeze on the last selection seen while open instead,
  // so the panel keeps showing what it was showing right up until it unmounts.
  const lastViewRef = useRef({ selectedTableId, selectedEdgeId });
  if (isOpen) {
    lastViewRef.current = { selectedTableId, selectedEdgeId };
  }
  const { selectedTableId: viewTableId, selectedEdgeId: viewEdgeId } = lastViewRef.current;

  if (!rendered) return null;

  const handleClose = () => {
    setOpen(false);
    selectTable(null);
    selectEdge(null);
  };

  return (
    <aside className={cn(
      'absolute right-0 top-0 z-20 w-[28rem] h-full border-l border-border bg-card shadow-2xl flex flex-col',
      isOpen ? 'animate-slide-in-right' : 'animate-slide-out-right',
    )}>
      <div className="h-9 px-4 border-b border-border flex items-center justify-between flex-shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {viewTableId ? 'Table Designer' : viewEdgeId ? 'Relation Designer' : 'Validation'}
        </h2>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {viewTableId && <TableProperties tableId={viewTableId} />}
        {viewEdgeId && <EdgeProperties edgeId={viewEdgeId} />}
        {!viewTableId && !viewEdgeId && <ValidationProperties />}
      </div>
    </aside>
  );
}

function TableProperties({ tableId }: { tableId: string }) {
  const node = useDiagramStore((s) =>
    s.diagrams.find((d) => d.id === s.activeDiagramId)?.nodes.find((n) => n.id === tableId)
  );
  const updateTable = useDiagramStore((s) => s.updateTable);
  const addColumn = useDiagramStore((s) => s.addColumn);
  const deleteTable = useDiagramStore((s) => s.deleteTable);
  const selectTable = useUIStore((s) => s.selectTable);

  if (!node) return null;
  const { table } = node.data;

  const handleDelete = () => {
    deleteTable(tableId);
    selectTable(null);
    toast.success(`Table "${table.name}" deleted`, { description: 'Press Ctrl+Z to undo' });
  };

  return (
    <div className="px-4 py-4 space-y-5">
      <Field label="Table name">
        <Input value={table.name} onChange={(e) => updateTable(tableId, { name: e.target.value })} className="font-mono text-xs" placeholder="table_name" />
      </Field>

      <Field label="Schema">
        <Input value={table.schema ?? ''} onChange={(e) => updateTable(tableId, { schema: e.target.value })} className="font-mono text-xs" placeholder="dbo" />
      </Field>

      <Field label="Color / module">
        <div className="flex gap-1.5 flex-wrap">
          {TABLE_COLORS.map((color) => {
            const isSelected = table.color === color;
            return (
              <button
                key={color}
                onClick={() => updateTable(tableId, { color })}
                title={color}
                style={{ backgroundColor: color }}
                className={cn(
                  'relative w-[18px] h-[18px] rounded-full transition-transform hover:scale-110',
                  isSelected && 'ring-2 ring-offset-2 ring-offset-card'
                )}
              >
                {isSelected && (
                  <Check className="w-2.5 h-2.5 text-white absolute inset-0 m-auto drop-shadow-sm" strokeWidth={3} />
                )}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Comment" optional>
        <Input value={table.comment ?? ''} onChange={(e) => updateTable(tableId, { comment: e.target.value })} placeholder="What this table represents..." className="text-xs" />
      </Field>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Columns ({table.columns.length})</h3>
        <Button size="sm" variant="ghost" onClick={() => addColumn(tableId)} className="h-6 text-xs gap-1 px-2">
          <Plus className="w-3 h-3" /> Add
        </Button>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <div className="flex items-center gap-2 pl-2 pr-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground bg-muted/50 border-b border-border/50">
          <div className="w-3 flex-shrink-0" />
          <span className="flex-1 min-w-0">Name</span>
          <span className="w-24 flex-shrink-0">Type</span>
          <span className="w-16 flex-shrink-0 text-right">Flags</span>
          <div className="w-5 flex-shrink-0" />
        </div>
        <div className="divide-y divide-border/50">
          {table.columns.map((col, idx) => (
            <ColumnEditor key={col.id} column={col} tableId={tableId} index={idx} totalColumns={table.columns.length} />
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-border">
        <Button variant="destructive" size="sm" onClick={handleDelete} className="w-full gap-2">
          <Trash2 className="w-3.5 h-3.5" /> Delete Table
        </Button>
      </div>
    </div>
  );
}

function ColumnEditor({ column, tableId, index, totalColumns }: { column: Column; tableId: string; index: number; totalColumns: number }) {
  const [expanded, setExpanded] = useState(false);
  const updateColumn = useDiagramStore((s) => s.updateColumn);
  const deleteColumn = useDiagramStore((s) => s.deleteColumn);
  const reorderColumns = useDiagramStore((s) => s.reorderColumns);

  const { base, param } = parseTypeParam(column.type);
  const showLongitud = PARAM_TYPES.has(base);
  const canAutoIncrement = column.isPrimaryKey && AUTO_INCREMENT_TYPES.has(base);
  const [localParam, setLocalParam] = useState(param);

  useEffect(() => {
    setLocalParam(parseTypeParam(column.type).param);
  }, [column.type]);

  const handleTypeChange = (newBase: string) => {
    const keep = PARAM_TYPES.has(newBase) && localParam;
    updateColumn(tableId, column.id, { type: keep ? `${newBase}(${localParam})` : newBase });
  };

  const commitLongitud = (val: string) => {
    const trimmed = val.trim();
    const error = validateTypeParam(base, trimmed);
    if (error) {
      toast.error(error);
      setLocalParam(param); // revert to the last valid value
      return;
    }
    setLocalParam(trimmed);
    updateColumn(tableId, column.id, { type: trimmed ? `${base}(${trimmed})` : base });
  };

  return (
    <div className={cn('bg-background/50 transition-all', expanded && 'bg-accent/20')}>
      <div className="flex items-center gap-2 pl-2 pr-3 py-1.5">
        <GripVertical className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />

        <Input
          value={column.name}
          onChange={(e) => updateColumn(tableId, column.id, { name: e.target.value })}
          className="h-7 px-1.5 text-xs font-mono border-0 bg-transparent focus-visible:bg-background flex-1 min-w-0"
          placeholder="column_name"
        />

        <Select value={BASE_TYPES.includes(base) ? base : 'VARCHAR'} onValueChange={handleTypeChange}>
          <SelectTrigger title={base} className="h-7 w-24 flex-shrink-0 px-1.5 text-xs font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BASE_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-xs font-mono">{t.toLowerCase()}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <ToggleIcon active={column.isPrimaryKey} onClick={() => updateColumn(tableId, column.id, { isPrimaryKey: !column.isPrimaryKey, isNullable: column.isPrimaryKey ? column.isNullable : false })} color="hsl(var(--erd-pk))" icon={<Key className="w-3 h-3" />} title="Primary Key" />
          <ToggleIcon active={column.isForeignKey} onClick={() => updateColumn(tableId, column.id, { isForeignKey: !column.isForeignKey })} color="hsl(var(--erd-fk))" icon={<Link2 className="w-3 h-3" />} title="Foreign Key" />
          <ToggleIcon active={column.isUnique} onClick={() => updateColumn(tableId, column.id, { isUnique: !column.isUnique })} color="hsl(var(--erd-unique))" icon={<Hash className="w-3 h-3" />} title="Unique" />
        </div>

        <button onClick={() => setExpanded(!expanded)} className="w-5 flex-shrink-0 text-muted-foreground hover:text-foreground flex items-center justify-center">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {expanded && (
        <div className="px-2 pb-2 space-y-2 border-t border-border/50 pt-2">
          <div className={cn('grid gap-2', canAutoIncrement ? 'grid-cols-2' : 'grid-cols-1')}>
            <SwitchRow compact label="Not Null" checked={!column.isNullable} onChange={(v) => updateColumn(tableId, column.id, { isNullable: !v })} disabled={column.isPrimaryKey} />
            {canAutoIncrement && (
              <SwitchRow compact label="Auto Increment" checked={column.isAutoIncrement} onChange={(v) => updateColumn(tableId, column.id, { isAutoIncrement: v })} />
            )}
          </div>
          {/* Short-value fields share a row; Comment stays full-width since it holds free text. */}
          <div className={cn('grid gap-2', showLongitud ? 'grid-cols-2' : 'grid-cols-1')}>
            {showLongitud && (
              <Field label="Length / precision">
                <Input
                  value={localParam}
                  onChange={(e) => setLocalParam(e.target.value)}
                  onBlur={(e) => commitLongitud(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitLongitud(localParam); }}
                  className="h-7 text-xs font-mono"
                  placeholder="e.g. 50 or 10,2"
                />
              </Field>
            )}
            <Field label="Default value" optional>
              <Input value={column.defaultValue ?? ''} onChange={(e) => updateColumn(tableId, column.id, { defaultValue: e.target.value })} className="h-7 text-xs font-mono" placeholder="NULL" />
            </Field>
          </div>
          <Field label="Comment" optional>
            <Input value={column.comment ?? ''} onChange={(e) => updateColumn(tableId, column.id, { comment: e.target.value })} className="h-7 text-xs" placeholder="Description..." />
          </Field>
          {column.references && (
            <div className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1.5 text-[11px] text-sky-700 dark:text-sky-300">
              FK reference: {column.references.tableId}.{column.references.columnId}
            </div>
          )}
          <div className="flex items-center gap-1 pt-1">
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] flex-1" disabled={index === 0} onClick={() => reorderColumns(tableId, index, index - 1)}>↑ Up</Button>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] flex-1" disabled={index === totalColumns - 1} onClick={() => reorderColumns(tableId, index, index + 1)}>↓ Down</Button>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteColumn(tableId, column.id)}><Trash2 className="w-3 h-3" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EdgeProperties({ edgeId }: { edgeId: string }) {
  const edge = useDiagramStore((s) => s.diagrams.find((d) => d.id === s.activeDiagramId)?.edges.find((e) => e.id === edgeId));
  // Selector returns the stable nodes array reference; .map() is deferred to useMemo
  // to avoid "getSnapshot should be cached" infinite loop (new array on every call).
  const nodes = useDiagramStore((s) => s.diagrams.find((d) => d.id === s.activeDiagramId)?.nodes ?? []);
  const tables = useMemo(() => nodes.map((n) => n.data.table), [nodes]);
  const updateRelationType = useDiagramStore((s) => s.updateRelationType);
  const updateRelation = useDiagramStore((s) => s.updateRelation);
  const updateRelationColumns = useDiagramStore((s) => s.updateRelationColumns);
  const convertManyToManyRelation = useDiagramStore((s) => s.convertManyToManyRelation);
  const deleteEdge = useDiagramStore((s) => s.deleteEdge);
  const selectEdge = useUIStore((s) => s.selectEdge);

  if (!edge || !edge.data) return null;
  const sourceTable = tables.find((t) => t.id === edge.source);
  const targetTable = tables.find((t) => t.id === edge.target);
  const sourceColumn = sourceTable?.columns.find((c) => c.id === edge.data!.sourceColumnId);
  const targetColumn = targetTable?.columns.find((c) => c.id === edge.data!.targetColumnId);

  return (
    <div className="px-4 py-4 space-y-5">
      <div className="rounded-lg border border-border bg-background/50 overflow-hidden">
        <div className="px-3 py-2.5 space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Parent / source</div>
          <div className="font-mono text-sm"><span className="text-muted-foreground">{sourceTable?.name}.</span><span className="font-semibold">{sourceColumn?.name}</span></div>
        </div>
        <div className="flex items-center gap-2 px-3">
          <div className="flex-1 h-px bg-border" />
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <ArrowDown className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 h-px bg-border" />
        </div>
        <div className="px-3 py-2.5 space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Child / target</div>
          <div className="font-mono text-sm"><span className="text-muted-foreground">{targetTable?.name}.</span><span className="font-semibold">{targetColumn?.name}</span></div>
        </div>
      </div>

      <Field label="Relation name / FK name">
        <Input value={edge.data.foreignKeyName ?? edge.data.label ?? ''} onChange={(e) => updateRelation(edgeId, { label: e.target.value, foreignKeyName: e.target.value })} className="font-mono text-xs" />
      </Field>

      <Field label="Cardinality">
        <Select value={edge.data.type} onValueChange={(value) => updateRelationType(edgeId, value as RelationType)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="one-to-one">1 — 1 · One-to-One</SelectItem>
            <SelectItem value="one-to-many">1 — N · One-to-Many</SelectItem>
            <SelectItem value="many-to-many">N — M · Generate junction table</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Parent column">
          <Select value={edge.data.sourceColumnId} onValueChange={(value) => updateRelationColumns(edgeId, value, edge.data!.targetColumnId)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{sourceTable?.columns.map((col) => <SelectItem key={col.id} value={col.id}>{col.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Child FK column">
          <Select value={edge.data.targetColumnId} onValueChange={(value) => updateRelationColumns(edgeId, edge.data!.sourceColumnId, value)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{targetTable?.columns.map((col) => <SelectItem key={col.id} value={col.id}>{col.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="ON DELETE">
          <Select value={edge.data.onDelete ?? 'RESTRICT'} onValueChange={(value) => updateRelation(edgeId, { onDelete: value as ReferentialAction })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{REFERENTIAL_ACTIONS.map((action) => <SelectItem key={action} value={action}>{action}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="ON UPDATE">
          <Select value={edge.data.onUpdate ?? 'CASCADE'} onValueChange={(value) => updateRelation(edgeId, { onUpdate: value as ReferentialAction })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{REFERENTIAL_ACTIONS.map((action) => <SelectItem key={action} value={action}>{action}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>

      <div className="space-y-2">
        <SwitchRow label="Show relation label" checked={edge.data.showLabel !== false} onChange={(v) => updateRelation(edgeId, { showLabel: v })} />
        <SwitchRow label="Show FK columns" checked={edge.data.showColumns !== false} onChange={(v) => updateRelation(edgeId, { showColumns: v })} />
        <SwitchRow label="Identifying relation" checked={Boolean(edge.data.isIdentifying)} onChange={(v) => updateRelation(edgeId, { isIdentifying: v })} />
      </div>

      <Button variant="outline" size="sm" onClick={() => convertManyToManyRelation(edgeId)} className="w-full gap-2">
        <Table2 className="w-3.5 h-3.5" /> Generate junction table
      </Button>
      <Button variant="destructive" size="sm" onClick={() => { deleteEdge(edgeId); selectEdge(null); }} className="w-full gap-2">
        <Trash2 className="w-3.5 h-3.5" /> Delete Relation
      </Button>
    </div>
  );
}

function ValidationProperties() {
  // Stable selector — returns the diagram object reference (no .map / new arrays inside).
  const activeDiagram = useDiagramStore((s) => s.diagrams.find((d) => d.id === s.activeDiagramId));
  const validateActiveDiagram = useDiagramStore((s) => s.validateActiveDiagram);
  // Derive issues outside the selector so the array is memoized.
  const issues = useMemo(() => validateActiveDiagram(), [activeDiagram, validateActiveDiagram]);

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="rounded-lg border border-border bg-background/50 p-3">
        <div className="text-sm font-semibold">Visual validation</div>
        <p className="mt-1 text-xs text-muted-foreground">Checks PK/FK integrity, nullable PKs, duplicate columns and type mismatches.</p>
      </div>
      {issues.length === 0 ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">No model issues detected.</div>
      ) : (
        issues.map((issue) => (
          <div key={issue.id} className={cn('rounded-lg border p-3 text-xs', issue.severity === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300')}>
            <div className="flex items-start gap-2">
              {issue.severity === 'error' ? <CircleAlert className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
              <span>{issue.message}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Field({ label, children, optional }: { label: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        {label}{optional && <span className="text-muted-foreground/50 normal-case font-normal tracking-normal">(optional)</span>}
      </label>
      {children}
    </div>
  );
}

function ToggleIcon({ active, onClick, color, icon, title }: { active: boolean; onClick: () => void; color: string; icon: React.ReactNode; title: string }) {
  return (
    <button onClick={onClick} title={title} className={cn('w-5 h-5 rounded flex items-center justify-center transition-all', active ? 'bg-foreground/10' : 'opacity-30 hover:opacity-100')} style={active ? { color } : undefined}>
      {icon}
    </button>
  );
}

function SwitchRow({ label, checked, onChange, disabled, compact }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', !compact && 'justify-between')}>
      <span className="text-xs">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
