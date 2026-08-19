import { useEffect, useState } from 'react';
import {
  Sun,
  Moon,
  FileCode,
  Plus,
  LayoutGrid,
  Braces,
  Maximize2,
} from 'lucide-react';
import { Button } from '@/components/UI/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/UI/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/UI/dialog';
import { useDiagramStore, useUIStore } from '@/store';
import { generateSQL } from '@/utils/sql-generator';
import { generateDBML } from '@/utils/dbml';
import { getFlowInstance } from '@/utils/flowInstance';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { isVSCode } from '@/lib/vscode-bridge';

export function Toolbar() {
  const [sqlOpen, setSqlOpen] = useState(false);
  const [codeTab, setCodeTab] = useState<'sql' | 'dbml'>('sql');

  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const addTable = useDiagramStore((s) => s.addTable);
  const getActiveDiagram = useDiagramStore((s) => s.getActiveDiagram);
  const autoLayout = useDiagramStore((s) => s.autoLayout);

  const handleViewSQL = () => {
    setCodeTab('sql');
    setSqlOpen(true);
  };

  const handleViewDBML = () => {
    setCodeTab('dbml');
    setSqlOpen(true);
  };

  const activeDiagram = getActiveDiagram();
  const sqlPreview = activeDiagram ? generateSQL(activeDiagram) : '';
  const dbmlPreview = activeDiagram ? generateDBML(activeDiagram) : '';
  const codePreview = codeTab === 'sql' ? sqlPreview : dbmlPreview;

  return (
    <header className="h-12 border-b border-border bg-card/60 backdrop-blur-sm flex items-center justify-between px-3 flex-shrink-0">
      {/* Left actions: create -> edit history -> arrange -> generate/export */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => addTable()}
              className="h-8 gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="text-xs">New Table</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Create new table (⌘N)</TooltipContent>
        </Tooltip>

        <div className="w-px h-5 bg-border mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                autoLayout();
                setTimeout(() => {
                  getFlowInstance()?.fitView({ padding: 0.04, maxZoom: 2, duration: 400 });
                }, 50);
              }}
              className="h-8 gap-1.5"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="text-xs">Auto layout</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Arrange tables automatically</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => getFlowInstance()?.fitView({ padding: 0.04, maxZoom: 2, duration: 400 })}
              className="h-8 gap-1.5"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="text-xs">Fit view</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom to fit all tables — keeps their current positions</TooltipContent>
        </Tooltip>

        <div className="w-px h-5 bg-border mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleViewSQL}
              className="h-8 gap-1.5"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span className="text-xs">SQL Preview</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Preview generated T-SQL</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleViewDBML}
              className="h-8 gap-1.5"
            >
              <Braces className="w-3.5 h-3.5" />
              <span className="text-xs">DBML</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Preview generated DBML (dbdiagram.io compatible)</TooltipContent>
        </Tooltip>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        <SavedIndicator updatedAt={activeDiagram?.updatedAt} />

        {!isVSCode() && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  className="h-8 w-8"
                >
                  {theme === 'dark' ? (
                    <Sun className="w-3.5 h-3.5" />
                  ) : (
                    <Moon className="w-3.5 h-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle theme</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* Code Preview Dialog: T-SQL / DBML */}
      <Dialog open={sqlOpen} onOpenChange={setSqlOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{codeTab === 'sql' ? 'T-SQL Preview' : 'DBML Preview'}</DialogTitle>
            <DialogDescription>
              {codeTab === 'sql'
                ? 'Generated DDL from your diagram. Compatible with Microsoft SQL Server.'
                : 'Generated DBML — paste it into dbdiagram.io, or share it as documentation.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-1 -mt-2">
            <button
              onClick={() => setCodeTab('sql')}
              className={cn('px-2.5 py-1 text-xs rounded-md font-mono', codeTab === 'sql' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50')}
            >
              T-SQL
            </button>
            <button
              onClick={() => setCodeTab('dbml')}
              className={cn('px-2.5 py-1 text-xs rounded-md font-mono', codeTab === 'dbml' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50')}
            >
              DBML
            </button>
          </div>
          <pre className="flex-1 overflow-auto bg-muted rounded-lg p-4 text-xs font-mono leading-relaxed">
            <code>{codePreview}</code>
          </pre>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(codePreview);
                toast.success(`${codeTab === 'sql' ? 'SQL' : 'DBML'} copied to clipboard`);
              }}
            >
              Copy
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}

function SavedIndicator({ updatedAt }: { updatedAt?: string }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // Inside VS Code the tab's own dirty-dot / Ctrl+S is the source of truth
  // for save state; this "browser autosave" indicator would be misleading there.
  if (!updatedAt || isVSCode()) return null;

  const seconds = Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000));
  const label =
    seconds < 5 ? 'Saved just now'
    : seconds < 60 ? `Saved ${seconds}s ago`
    : seconds < 3600 ? `Saved ${Math.floor(seconds / 60)}m ago`
    : `Saved ${Math.floor(seconds / 3600)}h ago`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1.5 select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>Autosaved to this browser — use Save to export a .asto backup</TooltipContent>
    </Tooltip>
  );
}
