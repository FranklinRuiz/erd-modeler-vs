import { nanoid } from 'nanoid';
import { DEFAULT_TABLE_COLOR } from '@/constants';
import type {
  Column,
  Table,
  TableNode,
  RelationEdge,
  RelationType,
  Diagram,
  ReferentialAction,
} from '@/types';

export const generateId = () => nanoid(10);

export function createColumn(overrides?: Partial<Column>): Column {
  return {
    id: generateId(),
    name: 'new_column',
    type: 'NVARCHAR(255)',
    isPrimaryKey: false,
    isForeignKey: false,
    isNullable: true,
    isUnique: false,
    isAutoIncrement: false,
    ...overrides,
  };
}

export function createIdColumn(tableName = 'table'): Column {
  return createColumn({
    name: `${singularize(tableName)}_id`,
    type: 'INT',
    isPrimaryKey: true,
    isNullable: false,
    isUnique: true,
    isAutoIncrement: true,
  });
}

export function createForeignKeyColumn(parentTable: Table, parentColumn: Column): Column {
  return createColumn({
    name: `${singularize(parentTable.name)}_${parentColumn.name}`.replace(/__+/g, '_'),
    type: parentColumn.type,
    isForeignKey: true,
    isNullable: false,
    isUnique: false,
    isAutoIncrement: false,
    references: {
      tableId: parentTable.id,
      columnId: parentColumn.id,
    },
  });
}

export function createTable(name = 'new_table', existingCount = 0, schema = 'dbo'): Table {
  return {
    id: generateId(),
    name,
    schema,
    columns: [createIdColumn(name)],
    color: DEFAULT_TABLE_COLOR,
  };
}

export function createTableNode(
  table: Table,
  position = { x: 0, y: 0 }
): TableNode {
  return {
    id: table.id,
    type: 'tableNode',
    position,
    data: { table },
    deletable: true,
  };
}

export function createRelationEdge(
  sourceTableId: string,
  sourceColumnId: string,
  targetTableId: string,
  targetColumnId: string,
  type: RelationType = 'one-to-many',
  options?: {
    label?: string;
    foreignKeyName?: string;
    onDelete?: ReferentialAction;
    onUpdate?: ReferentialAction;
  }
): RelationEdge {
  return {
    id: `${sourceTableId}-${targetTableId}-${generateId()}`,
    source: sourceTableId,
    target: targetTableId,
    sourceHandle: `${sourceColumnId}-source`,
    targetHandle: `${targetColumnId}-target`,
    type: 'relationEdge',
    data: {
      type,
      sourceColumnId,
      targetColumnId,
      label: options?.label,
      foreignKeyName: options?.foreignKeyName,
      onDelete: options?.onDelete ?? 'NO ACTION',
      onUpdate: options?.onUpdate ?? 'NO ACTION',
      showLabel: true,
      showColumns: true,
      isIdentifying: false,
    },
  };
}

export function createJunctionTable(
  leftTable: Table,
  leftPk: Column,
  rightTable: Table,
  rightPk: Column,
  existingCount = 0
): Table {
  const name = `${singularize(leftTable.name)}_${singularize(rightTable.name)}`;
  const leftFk = createForeignKeyColumn(leftTable, leftPk);
  const rightFk = createForeignKeyColumn(rightTable, rightPk);

  return {
    id: generateId(),
    name,
    schema: leftTable.schema ?? rightTable.schema ?? 'dbo',
    color: DEFAULT_TABLE_COLOR,
    columns: [
      { ...leftFk, isPrimaryKey: true, isNullable: false },
      { ...rightFk, isPrimaryKey: true, isNullable: false },
    ],
    comment: `Junction table generated for ${leftTable.name} ↔ ${rightTable.name}`,
  };
}

export function createDiagram(name = 'Untitled Diagram'): Diagram {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    nodes: [],
    edges: [],
    settings: {
      showDataTypes: true,
      showConstraints: true,
      showRelationLabels: true,
      showForeignKeyColumns: true,
      snapToGrid: true,
      gridSize: 20,
    },
  };
}

export function singularize(name: string): string {
  const clean = name.trim().replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  if (clean.endsWith('ies')) return `${clean.slice(0, -3)}y`;
  if (clean.endsWith('ses')) return clean.slice(0, -2);
  if (clean.endsWith('s')) return clean.slice(0, -1);
  return clean || 'table';
}
