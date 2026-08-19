import type { Diagram, ValidationIssue, Table, Column } from '@/types';

// SQL Server type families for FK compatibility checking
const numericFamilies = ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'REAL', 'MONEY', 'SMALLMONEY', 'BIT'];
const textFamilies = ['VARCHAR', 'NVARCHAR', 'CHAR', 'NCHAR', 'TEXT', 'NTEXT'];
const dateFamilies = ['DATE', 'DATETIME', 'DATETIME2', 'SMALLDATETIME', 'DATETIMEOFFSET', 'TIME'];

export function validateDiagram(diagram: Diagram): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const tables = diagram.nodes.map((node) => node.data.table);
  const tableMap = new Map(tables.map((table) => [table.id, table]));

  for (const table of tables) {
    const pkColumns = table.columns.filter((column) => column.isPrimaryKey);
    if (pkColumns.length === 0) {
      issues.push({
        id: `table-${table.id}-no-pk`,
        severity: 'warning',
        tableId: table.id,
        message: `Table "${table.name}" has no Primary Key (PK). Open the table, select the identifier column and toggle the key icon (PK).`,
      });
    }

    const names = new Set<string>();
    for (const column of table.columns) {
      const normalized = column.name.trim().toLowerCase();
      if (names.has(normalized)) {
        issues.push({
          id: `col-${column.id}-duplicate`,
          severity: 'error',
          tableId: table.id,
          columnId: column.id,
          message: `Duplicate column: "${column.name}" appears more than once in table "${table.name}". Rename one of the columns.`,
        });
      }
      names.add(normalized);

      if (column.isPrimaryKey && column.isNullable) {
        issues.push({
          id: `col-${column.id}-pk-nullable`,
          severity: 'error',
          tableId: table.id,
          columnId: column.id,
          message: `Primary Key "${column.name}" in table "${table.name}" allows NULL, which is not permitted. Open the table and disable the Nullable (NN) option on that column.`,
        });
      }

      // Only "created_at" is flagged: it's almost always meant to be stamped once,
      // on insert, by the database. "updated_at" is frequently maintained by the
      // application or a trigger instead (SQL Server has no ON UPDATE clause), so
      // requiring a DEFAULT there produces false positives.
      const normalizedName = column.name.trim().toLowerCase();
      if (
        normalizedName === 'created_at' &&
        !(column.defaultValue && /getdate|sysdatetime|current_timestamp/i.test(column.defaultValue))
      ) {
        issues.push({
          id: `col-${column.id}-missing-timestamp-default`,
          severity: 'warning',
          tableId: table.id,
          columnId: column.id,
          message: `Column "${column.name}" in table "${table.name}" looks like a timestamp audit column but has no DEFAULT GETDATE(). Set a default so new rows get a timestamp automatically.`,
        });
      }

      if (column.isForeignKey && !column.references) {
        // Only report if no relation edge already covers this column as target.
        // A manually-toggled FK on a column that has an edge is not an issue.
        const coveredByEdge = diagram.edges.some(
          (edge) => edge.target === table.id && edge.data?.targetColumnId === column.id
        );
        if (!coveredByEdge) {
          issues.push({
            id: `col-${column.id}-fk-no-ref`,
            severity: 'error',
            tableId: table.id,
            columnId: column.id,
            message: `Column "${column.name}" in table "${table.name}" is marked as FK but has no relation. Draw a connection from this column to the target table's PK column, or unmark FK if it was a mistake.`,
          });
        }
      }
    }
  }

  for (const edge of diagram.edges) {
    if (!edge.data) continue;
    const parent = tableMap.get(edge.source);
    const child = tableMap.get(edge.target);
    if (!parent || !child) continue;

    const parentColumn = parent.columns.find((column) => column.id === edge.data!.sourceColumnId);
    const childColumn = child.columns.find((column) => column.id === edge.data!.targetColumnId);
    if (!parentColumn || !childColumn) {
      issues.push({
        id: `edge-${edge.id}-missing-column`,
        severity: 'error',
        edgeId: edge.id,
        message: `Relation "${edge.data.label ?? edge.id}" points to a column that no longer exists. Delete this relation and recreate it.`,
      });
      continue;
    }

    if (!parentColumn.isPrimaryKey && !parentColumn.isUnique) {
      issues.push({
        id: `edge-${edge.id}-source-not-key`,
        severity: 'error',
        edgeId: edge.id,
        tableId: parent.id,
        columnId: parentColumn.id,
        message: `Column "${parentColumn.name}" in table "${parent.name}" is used as a relation source but is not marked as PK or UNIQUE. Relations must start from a key column.`,
      });
    }

    if (!childColumn.isForeignKey) {
      issues.push({
        id: `edge-${edge.id}-target-not-fk`,
        severity: 'warning',
        edgeId: edge.id,
        tableId: child.id,
        columnId: childColumn.id,
        message: `Column "${childColumn.name}" in table "${child.name}" participates in a relation but is not marked as FK. Open the table and mark that column as FK.`,
      });
    }

    if (!areTypesCompatible(parentColumn, childColumn)) {
      issues.push({
        id: `edge-${edge.id}-type-mismatch`,
        severity: 'error',
        edgeId: edge.id,
        message: `Type mismatch in relation: "${parent.name}.${parentColumn.name}" is ${parentColumn.type} but "${child.name}.${childColumn.name}" is ${childColumn.type}. Both columns must be the same type for the foreign key to work correctly.`,
      });
    }

    if (!childColumn.isNullable && (edge.data.onDelete === 'SET NULL' || edge.data.onUpdate === 'SET NULL')) {
      const actions = [
        edge.data.onDelete === 'SET NULL' ? 'ON DELETE' : null,
        edge.data.onUpdate === 'SET NULL' ? 'ON UPDATE' : null,
      ].filter(Boolean).join(' / ');
      issues.push({
        id: `edge-${edge.id}-set-null-not-null`,
        severity: 'error',
        edgeId: edge.id,
        tableId: child.id,
        columnId: childColumn.id,
        message: `Relation "${edge.data.label ?? edge.id}" uses ${actions} SET NULL but "${child.name}.${childColumn.name}" is NOT NULL. SQL Server accepts the constraint but fails the first time a parent row is deleted/updated. Mark the column nullable or change the action to NO ACTION/CASCADE.`,
      });
    }
  }

  for (const { tableId, viaTableId } of findMultiCascadePaths(diagram)) {
    const table = tableMap.get(tableId);
    const rootTable = tableMap.get(viaTableId);
    if (!table || !rootTable) continue;
    issues.push({
      id: `cascade-multipath-${viaTableId}-${tableId}`,
      severity: 'error',
      tableId: table.id,
      message: `Table "${table.name}" is reachable from "${rootTable.name}" through more than one CASCADE path. SQL Server rejects this at CREATE/ALTER TABLE time ("may cause cycles or multiple cascade paths"). Change ON DELETE/UPDATE to NO ACTION on one of the paths.`,
    });
  }

  return issues;
}

/** Finds tables reachable from some ancestor through 2+ distinct CASCADE paths — SQL Server
 *  rejects creating such a foreign key graph outright (error 1785), so this must be caught
 *  before generating/running the script rather than after. */
function findMultiCascadePaths(diagram: Diagram): { tableId: string; viaTableId: string }[] {
  const cascadeAdj = new Map<string, string[]>();
  for (const edge of diagram.edges) {
    if (!edge.data) continue;
    if (edge.data.onDelete === 'CASCADE' || edge.data.onUpdate === 'CASCADE') {
      const list = cascadeAdj.get(edge.source) ?? [];
      list.push(edge.target);
      cascadeAdj.set(edge.source, list);
    }
  }

  const results: { tableId: string; viaTableId: string }[] = [];

  for (const root of diagram.nodes) {
    const reachCount = new Map<string, number>();
    const stack: { node: string; path: Set<string> }[] = [{ node: root.id, path: new Set([root.id]) }];
    while (stack.length > 0) {
      const { node, path } = stack.pop()!;
      for (const child of cascadeAdj.get(node) ?? []) {
        if (path.has(child)) continue; // an actual cycle, not a second distinct path — skip to terminate
        reachCount.set(child, (reachCount.get(child) ?? 0) + 1);
        stack.push({ node: child, path: new Set([...path, child]) });
      }
    }
    for (const [tableId, count] of reachCount) {
      if (count >= 2) results.push({ tableId, viaTableId: root.id });
    }
  }

  return results;
}

export function getTableValidationLevel(diagram: Diagram, tableId: string): 'error' | 'warning' | 'ok' {
  const issues = validateDiagram(diagram).filter((issue) => issue.tableId === tableId);
  if (issues.some((issue) => issue.severity === 'error')) return 'error';
  if (issues.some((issue) => issue.severity === 'warning')) return 'warning';
  return 'ok';
}

function areTypesCompatible(parent: Column, child: Column): boolean {
  if (parent.type === child.type) return true;
  return family(parent.type) === family(child.type);
}

function family(type: string): string {
  const upper = type.toUpperCase();
  if (numericFamilies.some((item) => upper.startsWith(item))) return 'numeric';
  if (textFamilies.some((item) => upper.startsWith(item))) return 'text';
  if (dateFamilies.some((item) => upper.startsWith(item))) return 'date';
  return upper;
}
