// Lightweight DBML (dbdiagram.io) <-> Diagram converter.
// Supports the subset of DBML that maps onto astoDB's model: schema.table blocks,
// column attributes (pk, increment, not null, unique, default, note, inline ref),
// composite PK via `indexes { (a, b) [pk] }`, and standalone `Ref:` relationship
// statements with cardinality symbols (`>`, `<`, `-`) and delete/update actions.
// It intentionally does not cover the full DBML grammar (enums, table groups,
// `<>` many-to-many shorthand) since those have no equivalent in the diagram model.
import type { Diagram, Table, Column, RelationEdge, ReferentialAction } from '@/types';
import { createDiagram, createTable, createTableNode, createColumn, createRelationEdge } from '@/utils/factories';

interface Block {
  header: string;
  body: string;
}

interface PendingRef {
  fromSchema: string;
  fromTable: string;
  fromColumn: string;
  symbol: string;
  toSchema: string;
  toTable: string;
  toColumn: string;
  onDelete?: string;
  onUpdate?: string;
}

function stripComments(text: string): string {
  return text.split('\n').map((line) => {
    const idx = line.indexOf('//');
    return idx >= 0 ? line.slice(0, idx) : line;
  }).join('\n');
}

/** Finds all `keyword ... { ... }` blocks, respecting nested braces. */
function findBlocks(text: string, keyword: string): Block[] {
  const blocks: Block[] = [];
  const re = new RegExp(`\\b${keyword}\\b([^{]*)\\{`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const braceStart = re.lastIndex - 1;
    let depth = 1;
    let i = braceStart + 1;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }
    blocks.push({ header: m[1].trim(), body: text.slice(braceStart + 1, i - 1) });
    re.lastIndex = i;
  }
  return blocks;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  if (trimmed.startsWith('`') && trimmed.endsWith('`')) return trimmed.slice(1, -1);
  return trimmed;
}

/** Splits a bracket attribute list on top-level commas, ignoring commas inside quotes. */
function splitAttrs(raw: string): string[] {
  const attrs: string[] = [];
  let current = '';
  let inQuote: string | null = null;
  for (const ch of raw) {
    if (inQuote) {
      current += ch;
      if (ch === inQuote) inQuote = null;
    } else if (ch === "'" || ch === '`') {
      inQuote = ch;
      current += ch;
    } else if (ch === ',') {
      attrs.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) attrs.push(current.trim());
  return attrs.filter(Boolean);
}

function splitSchemaTable(token: string): { schema: string; table: string } {
  const parts = token.replace(/"/g, '').split('.').filter(Boolean);
  const table = parts.pop() ?? token;
  return { schema: parts.length ? parts.join('.') : 'dbo', table };
}

const DBML_TO_ACTION: Record<string, ReferentialAction> = {
  cascade: 'CASCADE',
  'set null': 'SET NULL',
  'set default': 'SET DEFAULT',
  'no action': 'NO ACTION',
  restrict: 'NO ACTION',
};

function parseOptions(raw?: string): { onDelete?: string; onUpdate?: string } {
  if (!raw) return {};
  const result: { onDelete?: string; onUpdate?: string } = {};
  for (const attr of splitAttrs(raw)) {
    const [key, ...rest] = attr.split(':');
    const value = rest.join(':').trim().toLowerCase();
    if (key.trim().toLowerCase() === 'delete') result.onDelete = value;
    if (key.trim().toLowerCase() === 'update') result.onUpdate = value;
  }
  return result;
}

export class DBMLParseError extends Error {}

export function parseDBMLToDiagram(text: string, diagramName = 'Imported Diagram'): Diagram {
  const clean = stripComments(text);
  const tableBlocks = findBlocks(clean, 'Table');
  if (tableBlocks.length === 0) {
    throw new DBMLParseError('No "Table" blocks found. Paste a valid DBML script.');
  }

  const diagram = createDiagram(diagramName);
  const tables: Table[] = [];
  const tableIndex = new Map<string, string>(); // "schema.table" (lowercase) -> table id
  const pendingRefs: PendingRef[] = [];

  for (const block of tableBlocks) {
    const headerMatch = block.header.match(/^"?([\w.]+)"?/);
    if (!headerMatch) continue;
    const { schema, table: tableName } = splitSchemaTable(headerMatch[1]);

    let body = block.body;

    const noteMatch = body.match(/\bNote\s*:\s*'([^']*)'/i);
    const tableComment = noteMatch?.[1];
    if (noteMatch) body = body.replace(noteMatch[0], '');

    const compositePk = new Set<string>();
    for (const idxBlock of findBlocks(body, 'indexes')) {
      const idxMatch = idxBlock.body.match(/\(([^)]+)\)\s*\[([^\]]*)\]/);
      if (idxMatch && /\bpk\b/i.test(idxMatch[2])) {
        idxMatch[1].split(',').forEach((c) => compositePk.add(c.trim().replace(/"/g, '')));
      }
    }
    body = body.replace(/\bindexes\b[^{]*\{[\s\S]*?\}/i, '');

    const table = createTable(tableName, tables.length, schema);
    table.comment = tableComment;
    table.columns = [];

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const colMatch = line.match(/^"?([\w]+)"?\s+([\w]+(?:\([^)]*\))?)\s*(?:\[([^\]]*)\])?/);
      if (!colMatch) continue;
      const [, colName, colType, attrsRaw] = colMatch;

      const column: Column = createColumn({ name: colName, type: colType.toUpperCase(), isNullable: true });

      for (const attr of splitAttrs(attrsRaw ?? '')) {
        const [rawKey, ...rest] = attr.split(':');
        const key = rawKey.trim().toLowerCase();
        const value = rest.join(':').trim();
        if (key === 'pk' || key === 'primary key') column.isPrimaryKey = true;
        else if (key === 'increment') column.isAutoIncrement = true;
        else if (key === 'not null') column.isNullable = false;
        else if (key === 'null') column.isNullable = true;
        else if (key === 'unique') column.isUnique = true;
        else if (key === 'note') column.comment = unquote(value);
        else if (key === 'default') column.defaultValue = unquote(value);
        else if (key === 'ref') {
          const refMatch = value.match(/^(<>|>|<|-)\s*"?([\w.]+)"?\.\s*"?([\w]+)"?$/);
          if (refMatch) {
            const target = splitSchemaTable(refMatch[2]);
            pendingRefs.push({
              fromSchema: schema, fromTable: tableName, fromColumn: colName,
              symbol: refMatch[1],
              toSchema: target.schema, toTable: target.table, toColumn: refMatch[3],
            });
          }
        }
      }

      if (compositePk.has(colName)) column.isPrimaryKey = true;
      if (column.isPrimaryKey) { column.isNullable = false; column.isUnique = true; }

      table.columns.push(column);
    }

    if (table.columns.length === 0) {
      throw new DBMLParseError(`Table "${tableName}" has no recognizable columns.`);
    }

    tables.push(table);
    tableIndex.set(`${schema}.${tableName}`.toLowerCase(), table.id);
  }

  // Standalone `Ref: schema.table.col > schema.table.col [delete: x, update: y]` statements
  const refRe = /\bRef\b(?:\s+\w+)?\s*:\s*"?([\w.]+)"?\.\s*"?([\w]+)"?\s*(<>|>|<|-)\s*"?([\w.]+)"?\.\s*"?([\w]+)"?(?:\s*\[([^\]]*)\])?/g;
  let refMatch: RegExpExecArray | null;
  while ((refMatch = refRe.exec(clean))) {
    const [, leftToken, leftCol, symbol, rightToken, rightCol, options] = refMatch;
    const left = splitSchemaTable(leftToken);
    const right = splitSchemaTable(rightToken);
    const { onDelete, onUpdate } = parseOptions(options);
    pendingRefs.push({
      fromSchema: left.schema, fromTable: left.table, fromColumn: leftCol,
      symbol,
      toSchema: right.schema, toTable: right.table, toColumn: rightCol,
      onDelete, onUpdate,
    });
  }

  const findColumn = (tableId: string, columnName: string): Column | undefined =>
    tables.find((t) => t.id === tableId)?.columns.find((c) => c.name === columnName);

  const edges: RelationEdge[] = [];

  for (const ref of pendingRefs) {
    if (ref.symbol === '<>') continue; // no direct equivalent without a materialized junction table

    const leftTableId = tableIndex.get(`${ref.fromSchema}.${ref.fromTable}`.toLowerCase());
    const rightTableId = tableIndex.get(`${ref.toSchema}.${ref.toTable}`.toLowerCase());
    if (!leftTableId || !rightTableId) continue;

    // Normalize so parentId/parentCol = "one" side (PK), childId/childCol = "many"/FK side.
    const isLeftChild = ref.symbol === '>' || ref.symbol === '-';
    const parentTableId = isLeftChild ? rightTableId : leftTableId;
    const parentColName = isLeftChild ? ref.toColumn : ref.fromColumn;
    const childTableId = isLeftChild ? leftTableId : rightTableId;
    const childColName = isLeftChild ? ref.fromColumn : ref.toColumn;

    const parentColumn = findColumn(parentTableId, parentColName);
    const childColumn = findColumn(childTableId, childColName);
    if (!parentColumn || !childColumn) continue;

    childColumn.isForeignKey = true;
    childColumn.references = { tableId: parentTableId, columnId: parentColumn.id };

    const parentTable = tables.find((t) => t.id === parentTableId)!;
    const childTable = tables.find((t) => t.id === childTableId)!;
    const label = `fk_${childTable.name}_${parentTable.name}_${childColumn.name}`;

    edges.push(createRelationEdge(
      parentTableId, parentColumn.id, childTableId, childColumn.id,
      ref.symbol === '-' ? 'one-to-one' : 'one-to-many',
      {
        label,
        foreignKeyName: label,
        onDelete: (ref.onDelete && DBML_TO_ACTION[ref.onDelete]) || 'NO ACTION',
        onUpdate: (ref.onUpdate && DBML_TO_ACTION[ref.onUpdate]) || 'NO ACTION',
      }
    ));
  }

  diagram.nodes = tables.map((table, i) =>
    createTableNode(table, { x: (i % 4) * 360, y: Math.floor(i / 4) * 280 })
  );
  diagram.edges = edges;

  return diagram;
}

function quoteIdent(name: string): string {
  return /^\w+$/.test(name) ? name : `"${name}"`;
}

function formatDefault(value: string): string {
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  if (/^(true|false|null)$/i.test(value)) return value.toLowerCase();
  if (/\(|\)/.test(value)) return `\`${value}\``;
  return `'${value.replace(/'/g, "\\'")}'`;
}

const ACTION_TO_DBML: Record<ReferentialAction, string> = {
  CASCADE: 'cascade',
  'SET NULL': 'set null',
  'SET DEFAULT': 'set default',
  'NO ACTION': 'no action',
};

export function generateDBML(diagram: Diagram): string {
  const lines: string[] = [];
  const tables = diagram.nodes.map((n) => n.data.table);

  lines.push(`Project ${quoteIdent(diagram.name.replace(/\s+/g, '_'))} {`);
  lines.push(`  database_type: 'SQL Server'`);
  lines.push(`  Note: 'Generated by astoDB'`);
  lines.push(`}`);
  lines.push('');

  for (const table of tables) {
    const tableRef = table.schema ? `${quoteIdent(table.schema)}.${quoteIdent(table.name)}` : quoteIdent(table.name);
    lines.push(`Table ${tableRef} {`);

    const pkCols = table.columns.filter((c) => c.isPrimaryKey);
    const isComposite = pkCols.length > 1;

    for (const col of table.columns) {
      const attrs: string[] = [];
      if (col.isPrimaryKey && !isComposite) attrs.push('pk');
      if (col.isAutoIncrement) attrs.push('increment');
      if (!col.isNullable && !col.isPrimaryKey) attrs.push('not null');
      if (col.isUnique && !col.isPrimaryKey) attrs.push('unique');
      if (col.defaultValue) attrs.push(`default: ${formatDefault(col.defaultValue)}`);
      if (col.comment) attrs.push(`note: '${col.comment.replace(/'/g, "\\'")}'`);

      const attrStr = attrs.length ? ` [${attrs.join(', ')}]` : '';
      lines.push(`  ${quoteIdent(col.name)} ${col.type.toLowerCase()}${attrStr}`);
    }

    if (isComposite) {
      lines.push('');
      lines.push('  indexes {');
      lines.push(`    (${pkCols.map((c) => quoteIdent(c.name)).join(', ')}) [pk]`);
      lines.push('  }');
    }

    if (table.comment) {
      lines.push('');
      lines.push(`  Note: '${table.comment.replace(/'/g, "\\'")}'`);
    }

    lines.push('}');
    lines.push('');
  }

  const tableMap = new Map(tables.map((t) => [t.id, t]));
  const refLines: string[] = [];
  for (const edge of diagram.edges) {
    if (!edge.data || edge.data.type === 'many-to-many') continue;
    const parentTable = tableMap.get(edge.source);
    const childTable = tableMap.get(edge.target);
    if (!parentTable || !childTable) continue;
    const parentCol = parentTable.columns.find((c) => c.id === edge.data!.sourceColumnId);
    const childCol = childTable.columns.find((c) => c.id === edge.data!.targetColumnId);
    if (!parentCol || !childCol) continue;

    const symbol = edge.data.type === 'one-to-one' ? '-' : '>';
    const parentRef = parentTable.schema ? `${parentTable.schema}.${parentTable.name}` : parentTable.name;
    const childRef = childTable.schema ? `${childTable.schema}.${childTable.name}` : childTable.name;

    const onDelete = edge.data.onDelete && edge.data.onDelete !== 'NO ACTION' ? ACTION_TO_DBML[edge.data.onDelete] : undefined;
    const onUpdate = edge.data.onUpdate && edge.data.onUpdate !== 'NO ACTION' ? ACTION_TO_DBML[edge.data.onUpdate] : undefined;
    const options = [onDelete && `delete: ${onDelete}`, onUpdate && `update: ${onUpdate}`].filter(Boolean);
    const optionsStr = options.length ? ` [${options.join(', ')}]` : '';

    refLines.push(`Ref: ${childRef}.${childCol.name} ${symbol} ${parentRef}.${parentCol.name}${optionsStr}`);
  }

  if (refLines.length > 0) {
    lines.push('// Relationships');
    lines.push(...refLines);
  }

  return lines.join('\n').trimEnd() + '\n';
}
