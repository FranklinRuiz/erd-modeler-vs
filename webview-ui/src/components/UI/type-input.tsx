import { useState, useRef, useEffect } from 'react';
import { DATA_TYPES } from '@/types';
import { cn } from '@/lib/utils';

const PARAM_TYPES = new Set([
  'NVARCHAR', 'VARCHAR', 'CHAR', 'NCHAR',
  'DECIMAL', 'NUMERIC',
  'FLOAT',
  'VARBINARY', 'BINARY',
  'TIME', 'DATETIME2', 'DATETIMEOFFSET',
]);

function parseParam(value: string): { base: string; param: string } {
  const m = value.match(/^([A-Z_]+)\((.+)\)$/i);
  if (m) return { base: m[1].toUpperCase(), param: m[2] };
  return { base: value.toUpperCase().split('(')[0].trim(), param: '' };
}

interface TypeInputProps {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

export function TypeInput({ value, onChange, compact = false }: TypeInputProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [param, setParam] = useState(() => parseParam(value).param);
  const inputRef = useRef<HTMLInputElement>(null);
  const paramRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync when value changes externally
  useEffect(() => {
    setQuery(value);
    setParam(parseParam(value).param);
  }, [value]);

  const filtered = query.trim()
    ? DATA_TYPES.filter((t) => t.toLowerCase().includes(query.toLowerCase()))
    : DATA_TYPES;

  const { base } = parseParam(query);
  const showParam = PARAM_TYPES.has(base);

  const commit = (val: string) => {
    const trimmed = val.trim();
    if (trimmed) onChange(trimmed);
    setQuery(trimmed || value);
    setParam(parseParam(trimmed || value).param);
    setOpen(false);
  };

  const commitParam = (newParam: string) => {
    const trimmed = newParam.trim();
    setParam(trimmed);
    const fullType = trimmed ? `${base}(${trimmed})` : base;
    onChange(fullType);
    setQuery(fullType);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) commit(query);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  return (
    <div ref={containerRef} className="flex items-center gap-1 w-full">
      {/* Combobox — same look as before, fills available space */}
      <div className="relative flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { commit(query); inputRef.current?.blur(); }
            if (e.key === 'Escape') { setQuery(value); setOpen(false); }
            if (e.key === 'Tab' && showParam) {
              e.preventDefault();
              setTimeout(() => paramRef.current?.focus(), 0);
            }
          }}
          spellCheck={false}
          className={cn(
            'w-full font-mono outline-none bg-transparent border border-transparent rounded',
            'hover:border-border focus:border-border transition-colors',
            compact
              ? 'h-6 px-1 text-[10px] text-muted-foreground'
              : 'h-7 px-2 text-xs text-foreground',
          )}
        />

        {open && filtered.length > 0 && (
          <ul className={cn(
            'absolute z-50 mt-0.5 max-h-52 overflow-y-auto rounded-md border border-border bg-popover shadow-lg right-0',
            compact ? 'text-[10px] min-w-[160px]' : 'text-xs min-w-[200px]',
          )}>
            {filtered.map((t) => (
              <li
                key={t}
                onMouseDown={(e) => { e.preventDefault(); commit(t); }}
                className={cn(
                  'px-2 py-1 font-mono cursor-pointer hover:bg-accent',
                  t === value && 'bg-accent/60 font-semibold',
                )}
              >
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Size / precision input — only appears for types that accept a param */}
      {showParam && (
        <input
          ref={paramRef}
          type="text"
          value={param}
          onChange={(e) => setParam(e.target.value)}
          onBlur={(e) => commitParam(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { commitParam(param); paramRef.current?.blur(); }
            if (e.key === 'Escape') setParam(parseParam(value).param);
          }}
          placeholder="size"
          spellCheck={false}
          className={cn(
            'flex-shrink-0 font-mono outline-none rounded text-center',
            'border border-border bg-transparent',
            'hover:border-foreground/40 focus:border-foreground/60 transition-colors',
            compact
              ? 'h-6 px-1 text-[10px] text-muted-foreground w-[42px]'
              : 'h-7 px-1 text-xs text-foreground w-[60px]',
          )}
        />
      )}
    </div>
  );
}
