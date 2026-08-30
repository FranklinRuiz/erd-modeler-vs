import type { Node, Edge } from '@xyflow/react';

// Free-form SQL Server type string — user can type any valid T-SQL type.
// DATA_TYPES is the suggestion list shown in the combobox.
export type DataType = string;

export const DATA_TYPES: string[] = [
  // Integer
  'INT',
  'BIGINT',
  'SMALLINT',
  'TINYINT',
  // Boolean
  'BIT',
  // Exact numeric
  'DECIMAL(10,2)',
  'DECIMAL(18,0)',
  'DECIMAL(18,4)',
  'DECIMAL(8,2)',
  'NUMERIC(10,2)',
  'NUMERIC(18,0)',
  // Money
  'MONEY',
  'SMALLMONEY',
  // Floating point
  'FLOAT',
  'REAL',
  // Unicode string
  'NVARCHAR(50)',
  'NVARCHAR(100)',
  'NVARCHAR(255)',
  'NVARCHAR(500)',
  'NVARCHAR(MAX)',
  // ASCII string
  'VARCHAR(50)',
  'VARCHAR(100)',
  'VARCHAR(255)',
  'VARCHAR(500)',
  'VARCHAR(MAX)',
  // Fixed-length char
  'CHAR(1)',
  'CHAR(10)',
  'NCHAR(1)',
  'NCHAR(10)',
  // Date / time
  'DATE',
  'TIME',
  'TIME(7)',
  'DATETIME',
  'DATETIME2',
  'DATETIME2(7)',
  'SMALLDATETIME',
  'DATETIMEOFFSET',
  'DATETIMEOFFSET(7)',
  // Special
  'UNIQUEIDENTIFIER',
  'ROWVERSION',
  'XML',
  'SQL_VARIANT',
  // Binary
  'VARBINARY(MAX)',
  'BINARY(16)',
  // Spatial / hierarchy
  'HIERARCHYID',
  'GEOMETRY',
  'GEOGRAPHY',
  // Deprecated (kept for legacy compatibility)
  'TEXT',
  'NTEXT',
  'IMAGE',
];

export const REFERENTIAL_ACTIONS = [
  'NO ACTION',
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
] as const;

export type ReferentialAction = (typeof REFERENTIAL_ACTIONS)[number];
export type RelationType = 'one-to-one' | 'one-to-many' | 'many-to-many';

export interface Column {
  id: string;
  name: string;
  type: DataType;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
  isUnique: boolean;
  isAutoIncrement: boolean;
  defaultValue?: string;
  comment?: string;
  references?: {
    tableId: string;
    columnId: string;
  };
}

export interface Table {
  id: string;
  name: string;
  schema?: string;
  comment?: string;
  columns: Column[];
  color?: string;
}

export type TableNode = Node<{
  table: Table;
  validationLevel?: 'error' | 'warning' | 'ok';
  dimmed?: boolean;
}, 'tableNode'>;

export interface RelationData extends Record<string, unknown> {
  type: RelationType;
  sourceColumnId: string;
  targetColumnId: string;
  label?: string;
  foreignKeyName?: string;
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
  showLabel?: boolean;
  showColumns?: boolean;
  isIdentifying?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
  /** Position (and total count) of this relation among siblings sharing the same source/target
   *  column+side, ordered by the connected table's vertical position. All siblings still exit
   *  from the same handle point — RelationEdge uses this to fan the lines apart right after
   *  they leave it, instead of drawing them stacked on top of each other. */
  sourceFanIndex?: number;
  sourceFanCount?: number;
  targetFanIndex?: number;
  targetFanCount?: number;
  /** Explicit bend-point X for relations whose default orthogonal path would otherwise land
   *  on the same corridor as another relation over an overlapping Y range (see
   *  computeEdgeLanes in utils/edgeLanes). Undefined for the common, non-colliding case —
   *  those keep the library's own default bend point untouched. */
  laneCenterX?: number;
  /** Whether the "one" mark near the parent (source) should show as optional (0 or 1, drawn
   *  with a circle) rather than mandatory (exactly 1) — reflects whether the child's actual FK
   *  column allows NULL. */
  sourceOptional?: boolean;
}

export type RelationEdge = Edge<RelationData, 'relationEdge'>;

export interface DiagramSettings {
  showDataTypes: boolean;
  showConstraints: boolean;
  showRelationLabels: boolean;
  showForeignKeyColumns: boolean;
  snapToGrid: boolean;
  gridSize: number;
}

export interface Diagram {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodes: TableNode[];
  edges: RelationEdge[];
  settings: DiagramSettings;
}

export interface WorkspaceState {
  diagrams: Diagram[];
  activeDiagramId: string | null;
}

export interface SerializedDiagram {
  version: '1.2';
  diagram: Diagram;
}

export interface ValidationIssue {
  id: string;
  severity: 'error' | 'warning';
  tableId?: string;
  columnId?: string;
  edgeId?: string;
  message: string;
}
