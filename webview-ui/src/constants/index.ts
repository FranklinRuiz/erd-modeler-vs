export const APP_NAME = 'astoDB';
export const APP_TAGLINE = 'Visual SQL Server Modeler';

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

// Fitting a large diagram on open would zoom out until column text is unreadable; stop at 80%
// and let the toolbar's Fit view show everything on demand.
export const OPEN_FIT_VIEW = { padding: 0.2, minZoom: 0.8, maxZoom: 1 };
