import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark' | 'system';

  // Selection state
  selectedAgentId: string | null;
  selectedSessionId: string | null;

  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: UIState['theme']) => void;
  selectAgent: (agentId: string | null) => void;
  selectSession: (sessionId: string | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: 'system',
      selectedAgentId: null,
      selectedSessionId: null,

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setTheme: (theme) => {
        set({ theme });
        // Apply theme to document
        const root = document.documentElement;
        if (theme === 'system') {
          const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          root.classList.toggle('dark', systemDark);
        } else {
          root.classList.toggle('dark', theme === 'dark');
        }
      },
      selectAgent: (selectedAgentId) => set({ selectedAgentId }),
      selectSession: (selectedSessionId) => set({ selectedSessionId }),
    }),
    {
      name: 'openclaw-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
      }),
    }
  )
);
