export const APP_NAME = 'astoDB';
export const APP_TAGLINE = 'Visual SQL Server Modeler';
export const APP_VERSION = '1.0.0';

export const STORAGE_KEY = 'astodb-erd-workspace';
export const THEME_KEY = 'astodb-theme';

/** Color palette assignable to tables (accent per entity/module) */
export const TABLE_COLORS = [
  '#94a3b8', // slate (neutral / default)
  '#0ea5e9', // sky
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
] as const;

export const DEFAULT_TABLE_COLOR = '#94a3b8';

export const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 };

export const NODE_DEFAULT_WIDTH = 280;
