import { create } from "zustand";

interface IdleState {
  isWarningVisible: boolean;
  secondsRemaining: number;
  _intervalId: ReturnType<typeof setInterval> | null;

  showWarning: () => void;
  dismissWarning: () => void;
  tick: () => void;
}

export const useIdleStore = create<IdleState>()((set, get) => ({
  isWarningVisible: false,
  secondsRemaining: 120,
  _intervalId: null,

  showWarning: () => {
    const { _intervalId } = get();
    if (_intervalId) clearInterval(_intervalId);

    const id = setInterval(() => get().tick(), 1000);
    set({ isWarningVisible: true, secondsRemaining: 120, _intervalId: id });
  },

  dismissWarning: () => {
    const { _intervalId } = get();
    if (_intervalId) clearInterval(_intervalId);
    set({ isWarningVisible: false, secondsRemaining: 120, _intervalId: null });
  },

  tick: () => {
    set((s) => {
      const next = s.secondsRemaining - 1;
      if (next <= 0) {
        if (s._intervalId) clearInterval(s._intervalId);
        return { secondsRemaining: 0, _intervalId: null };
      }
      return { secondsRemaining: next };
    });
  },
}));
