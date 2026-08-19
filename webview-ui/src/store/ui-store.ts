import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { THEME_KEY } from '@/constants';

type Theme = 'light' | 'dark';

interface UIStore {
  theme: Theme;
  selectedTableId: string | null;
  selectedEdgeId: string | null;
  selectedTableIds: string[];
  hoveredTableId: string | null;
  isPropertiesOpen: boolean;
  isSidebarCollapsed: boolean;

  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  selectTable: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  setSelectedTableIds: (ids: string[]) => void;
  setHoveredTableId: (id: string | null) => void;
  setPropertiesOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      theme: 'light',
      selectedTableId: null,
      selectedEdgeId: null,
      selectedTableIds: [],
      hoveredTableId: null,
      isPropertiesOpen: true,
      isSidebarCollapsed: false,

      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setTheme: (theme) => set({ theme }),
      selectTable: (id) =>
        set({ selectedTableId: id, selectedEdgeId: null, isPropertiesOpen: id !== null }),
      selectEdge: (id) =>
        set({ selectedEdgeId: id, selectedTableId: null, isPropertiesOpen: id !== null }),
      setSelectedTableIds: (ids) => set({ selectedTableIds: ids }),
      setHoveredTableId: (id) => set({ hoveredTableId: id }),
      setPropertiesOpen: (open) => set({ isPropertiesOpen: open }),
      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
      toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
    }),
    {
      name: THEME_KEY,
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as Partial<UIStore>;
        if (version < 1) {
          return { ...state, theme: 'light' as Theme };
        }
        return state;
      },
    }
  )
);
