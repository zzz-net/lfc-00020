import { create } from "zustand";

interface AppState {
  currentOperator: string;
  setCurrentOperator: (name: string) => void;
  toast: { message: string; type: "success" | "error" | "info" } | null;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  clearToast: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentOperator: "调度员A",
  setCurrentOperator: (name) => set({ currentOperator: name }),
  toast: null,
  showToast: (message, type = "info") => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 3500);
  },
  clearToast: () => set({ toast: null }),
}));
