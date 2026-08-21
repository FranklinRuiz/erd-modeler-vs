import { useMemo, useState } from 'react';
import {
  Database,
  Plus,
  Search,
  X,
  MoreHorizontal,
  Copy,
  Trash2,
  Table as TableIcon,
  AlertTriangle,
  CircleAlert,
  CheckCircle2,
  Pencil,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Button } from '@/components/UI/button';
import { Input } from '@/components/UI/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/UI/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/UI/tooltip';
import { useDiagramStore, useUIStore } from '@/store';
import { cn } from '@/lib/utils';
import { APP_NAME, APP_TAGLINE } from '@/constants';
import { validateDiagram } from '@/utils/validation';
import type { Table } from '@/types';

export function Sidebar() {
  const [search, setSearch] = useState('');
  const diagrams = useDiagramStore((s) => s.diagrams);
  const activeDiagramId = useDiagramStore((s) => s.activeDiagramId);
  const activeDiagram = diagrams.find((d) => d.id === activeDiagramId);

  const renameDiagram = useDiagramStore((s) => s.renameDiagram);

  const addTable = useDiagramStore((s) => s.addTable);
  const deleteTable = useDiagramStore((s) => s.deleteTable);
  const duplicateTable = useDiagramStore((s) => s.duplicateTable);

  const selectedTableId = useUIStore((s) => s.selectedTableId);
  const selectTable = useUIStore((s) => s.selectTable);
  const setPropertiesOpen = useUIStore((s) => s.setPropertiesOpen);
  const isCollapsed = useUIStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const [editingDiagramName, setEditingDiagramName] = useState(false);
  const [editValue, setEditValue] = useState('');

  const tables = activeDiagram?.nodes.map((n) => n.data.table) ?? [];
  const relations = activeDiagram?.edges ?? [];
  const issues = useMemo(() => activeDiagram ? validateDiagram(activeDiagram) : [], [activeDiagram]);

  const filteredTables = tables.filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const tableMatch = `${t.schema ?? ''}.${t.name}`.toLowerCase().includes(q);
    const columnMatch = t.columns.some((c) => c.name.toLowerCase().includes(q));
    return tableMatch || columnMatch;
  });

  const groupedTables = useMemo(() => {
    return filteredTables.reduce<Record<string, typeof filteredTables>>((acc, table) => {
      const key = table.schema || 'dbo';
      acc[key] = acc[key] ?? [];
      acc[key].push(table);
      return acc;
    }, {});
  }, [filteredTables]);

  const handleStartRename = () => {
    if (!activeDiagram) return;
    setEditValue(activeDiagram.name);
    setEditingDiagramName(true);
  };

  const handleSaveRename = () => {
    if (activeDiagram && editValue.trim()) renameDiagram(activeDiagram.id, editValue.trim());
    setEditingDiagramName(false);
  };

  if (isCollapsed) {
    return (
      <aside className="w-14 border-r border-border bg-card flex flex-col items-center h-full">
        {/* h-12 matches the toolbar so the border line runs flush across both */}
        <div className="h-12 w-full border-b border-border flex items-center justify-center gap-1 flex-shrink-0">
          <div className="w-7 h-7 rounded-md bg-foreground text-background flex items-center justify-center flex-shrink-0">
            <Database className="w-4 h-4" />
          </div>
        </div>

        <div className="flex-1 w-full min-h-0 flex flex-col items-center gap-1.5 py-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={toggleSidebar}>
                <PanelLeftOpen className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          </Tooltip>

          <div className="w-6 border-t border-border my-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => addTable()}>
                <Plus className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New table (Ctrl/Cmd + N)</TooltipContent>
          </Tooltip>

          <div className="w-6 border-t border-border my-1" />

          <div className="flex-1 w-full min-h-0 overflow-y-auto flex flex-col items-center gap-1.5 px-1.5">
            {tables.map((table) => (
              <TableChip
                key={table.id}
                table={table}
                isSelected={selectedTableId === table.id}
                hasError={issues.some((i) => i.tableId === table.id && i.severity === 'error')}
                hasWarning={issues.some((i) => i.tableId === table.id && i.severity === 'warning')}
                onSelect={() => { selectTable(table.id); setPropertiesOpen(true); }}
              />
            ))}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { selectTable(null); setPropertiesOpen(true); }}
                className="relative w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 hover:bg-accent transition-colors"
              >
                {issues.length === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : issues.some((i) => i.severity === 'error') ? (
                  <CircleAlert className="w-4 h-4 text-destructive" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Model validation · {issues.length} issue{issues.length === 1 ? '' : 's'}</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-72 border-r border-border bg-card flex flex-col h-full">
      {/* App header — h-12 matches the toolbar so the border line runs flush across both */}
      <div className="h-12 px-2 border-b border-border flex items-center gap-2.5 flex-shrink-0">
        <div className="w-7 h-7 rounded-md bg-foreground text-background flex items-center justify-center flex-shrink-0">
          <Database className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="font-semibold text-sm tracking-tight truncate">{APP_NAME}</h1>
          <p className="text-[10px] text-muted-foreground truncate">{APP_TAGLINE}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10 flex-shrink-0" onClick={toggleSidebar}>
              <PanelLeftClose className="w-5 h-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Collapse sidebar</TooltipContent>
        </Tooltip>
      </div>

      {/* Diagram name row */}
      <div className="px-2 py-2.5 border-b border-border flex items-center gap-1.5">
        {editingDiagramName ? (
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveRename}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
            className="h-7 text-xs flex-1"
            autoFocus
          />
        ) : (
          <span
            className="flex-1 text-sm font-semibold font-mono truncate cursor-text"
            onDoubleClick={handleStartRename}
            title="Double-click to rename"
          >
            {activeDiagram?.name ?? 'No diagram'}
          </span>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={handleStartRename}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Rename diagram</TooltipContent>
        </Tooltip>
      </div>

      {/* Tables header */}
      <div className="px-2 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Tables ({tables.length})
        </span>
      </div>

      {/* Search */}
      <div className="px-2 pb-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && search) { e.stopPropagation(); setSearch(''); } }}
            placeholder="Search tables, columns..."
            className="h-7 pl-8 pr-7 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              title="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-sm grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filteredTables.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <TableIcon className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">{search ? 'No tables found' : 'No tables yet'}</p>
            {!search && (
              <Button size="sm" variant="ghost" onClick={() => addTable()} className="mt-2 text-xs h-7">
                Create your first table
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {Object.entries(groupedTables).map(([schema, groupTables]) => (
              <div key={schema}>
                <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {schema}
                </div>
                <div className="space-y-0">
                  {groupTables.map((table) => {
                    const tableIssues = issues.filter((i) => i.tableId === table.id);
                    const hasError = tableIssues.some((i) => i.severity === 'error');
                    const hasWarning = tableIssues.some((i) => i.severity === 'warning');
                    const searchQuery = search.trim().toLowerCase();
                    const matchedColumns = searchQuery
                      ? table.columns.filter((c) => c.name.toLowerCase().includes(searchQuery))
                      : [];
                    return (
                      <div
                        key={table.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => { selectTable(table.id); setPropertiesOpen(true); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') { selectTable(table.id); setPropertiesOpen(true); }
                        }}
                        className={cn(
                          'w-full text-left px-2 py-1 rounded-md flex flex-col gap-0.5 text-sm transition-colors group cursor-pointer',
                          selectedTableId === table.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                        )}
                      >
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-3.5 rounded-sm flex-shrink-0" style={{ backgroundColor: table.color }} />
                        <span className="font-mono text-xs truncate flex-1">
                          {table.schema ? `${table.schema}.` : ''}{table.name}
                        </span>
                        {hasError && <CircleAlert className="w-3.5 h-3.5 text-destructive" />}
                        {!hasError && hasWarning && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                        <span className="text-[10px] text-muted-foreground font-mono">{table.columns.length}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-foreground/10"
                            >
                              <MoreHorizontal className="w-3 h-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); duplicateTable(table.id); }}>
                              <Copy className="w-3.5 h-3.5" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteTable(table.id);
                                if (selectedTableId === table.id) selectTable(null);
                              }}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {matchedColumns.length > 0 && (
                        <div className="pl-3 flex flex-wrap gap-1">
                          {matchedColumns.slice(0, 6).map((c) => (
                            <span key={c.id} className="text-[9px] font-mono px-1 rounded bg-primary/10 text-primary">
                              {c.name}
                            </span>
                          ))}
                        </div>
                      )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer: validation + relations */}
        <div className="mt-4 border-t border-border pt-3">
          <button
            onClick={() => { selectTable(null); setPropertiesOpen(true); }}
            className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent/50 flex items-center gap-2"
          >
            {issues.length === 0
              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              : issues.some((i) => i.severity === 'error')
                ? <CircleAlert className="w-3.5 h-3.5 text-destructive" />
                : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
            <span className="text-xs">Model validation</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{issues.length}</span>
          </button>

          <div className="mt-2 px-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Relations ({relations.length})
          </div>
          {relations.slice(0, 12).map((edge) => (
            <button
              key={edge.id}
              onClick={() => useUIStore.getState().selectEdge(edge.id)}
              className="mt-0.5 w-full text-left px-2 py-1 rounded-md hover:bg-accent/50 flex items-center gap-2"
            >
              <span className="text-primary">↳</span>
              <span className="truncate text-[11px] font-mono">
                {edge.data?.foreignKeyName ?? edge.data?.label ?? edge.id}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function TableChip({
  table,
  isSelected,
  hasError,
  hasWarning,
  onSelect,
}: {
  table: Table;
  isSelected: boolean;
  hasError: boolean;
  hasWarning: boolean;
  onSelect: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onSelect}
          className={cn(
            'relative w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-mono font-semibold uppercase flex-shrink-0 transition-all',
            isSelected ? 'ring-2 ring-primary' : 'ring-1 ring-transparent hover:ring-border'
          )}
          style={{ backgroundColor: `${table.color ?? '#94a3b8'}26`, color: table.color ?? '#94a3b8' }}
        >
          {table.name.slice(0, 2)}
          {(hasError || hasWarning) && (
            <span
              className={cn(
                'absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-card',
                hasError ? 'bg-destructive' : 'bg-amber-500'
              )}
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {table.schema ? `${table.schema}.` : ''}{table.name} · {table.columns.length} cols
      </TooltipContent>
    </Tooltip>
  );
}
