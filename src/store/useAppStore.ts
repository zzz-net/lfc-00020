import { create } from 'zustand';

const DEFAULT_OPERATOR = '调度员小王';

interface AppState {
  operator: string;
  setOperator: (name: string) => void;
  reloadKey: number;
  triggerReload: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  operator: localStorage.getItem('operator') || DEFAULT_OPERATOR,
  setOperator: (name) => {
    localStorage.setItem('operator', name);
    set({ operator: name });
  },
  reloadKey: 0,
  triggerReload: () => set((s) => ({ reloadKey: s.reloadKey + 1 })),
}));
