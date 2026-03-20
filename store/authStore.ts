import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types/report.types";
import { authApi } from "@/lib/api";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (rut: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setTokens: (access: string, refresh: string, user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      setTokens: (access, refresh, user) => {
        localStorage.setItem("access_token", access);
        localStorage.setItem("refresh_token", refresh);
        document.cookie = `rv_token=${access}; domain=.dmcprojects.cl; path=/; secure; samesite=lax; max-age=28800`;
        set({ accessToken: access, refreshToken: refresh, user, isAuthenticated: true });
      },

      login: async (rut, password) => {
        set({ isLoading: true });
        try {
          const { data } = await authApi.login(rut, password);
          get().setTokens(data.access_token, data.refresh_token, data.user);
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        const rt = get().refreshToken;
        if (rt) {
          try { await authApi.logout(rt); } catch { /* silent */ }
        }
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        document.cookie = "rv_token=; domain=.dmcprojects.cl; path=/; max-age=0";
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },
    }),
    {
      name: "ris-auth",
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
