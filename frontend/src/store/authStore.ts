import { create } from "zustand";
import { persist } from "zustand/middleware";

type AuthState = {
  token: string | null;
  userId: string | null;
  email: string | null;
  setAuth: (token: string, userId: string, email: string) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      email: null,
      setAuth: (token, userId, email) => set({ token, userId, email }),
      clear: () => set({ token: null, userId: null, email: null }),
    }),
    {
      name: "flashcore-auth",
    }
  )
);
