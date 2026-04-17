import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserStreakStats = {
  currentStreakDays: number;
  longestStreakDays: number;
  totalLogins: number;
  totalActions: number;
  lastLoginDate: string | null;
  lastActionDate: string | null;
};

export const EMPTY_STREAK_STATS: UserStreakStats = {
  currentStreakDays: 0,
  longestStreakDays: 0,
  totalLogins: 0,
  totalActions: 0,
  lastLoginDate: null,
  lastActionDate: null,
};

type StreakState = {
  byUser: Record<string, UserStreakStats>;
  registerLogin: (userId: string) => void;
  registerActivity: (userId: string) => void;
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayDelta(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay);
}

function ensureStats(existing: UserStreakStats | undefined): UserStreakStats {
  if (!existing) {
    return { ...EMPTY_STREAK_STATS };
  }
  return {
    ...EMPTY_STREAK_STATS,
    ...existing,
  };
}

export const useStreakStore = create<StreakState>()(
  persist(
    (set, get) => ({
      byUser: {},
      registerLogin: (userId) => {
        const today = toDateKey(new Date());
        const current = ensureStats(get().byUser[userId]);
        const next: UserStreakStats = {
          ...current,
          totalLogins: current.totalLogins + 1,
          lastLoginDate: today,
        };

        set((state) => ({
          byUser: {
            ...state.byUser,
            [userId]: next,
          },
        }));
      },
      registerActivity: (userId) => {
        const today = toDateKey(new Date());
        const current = ensureStats(get().byUser[userId]);

        let nextStreak = current.currentStreakDays;
        if (current.lastActionDate !== today) {
          if (!current.lastActionDate) {
            nextStreak = 1;
          } else {
            const diff = dayDelta(current.lastActionDate, today);
            nextStreak = diff === 1 ? current.currentStreakDays + 1 : 1;
          }
        }

        const next: UserStreakStats = {
          ...current,
          totalActions: current.totalActions + 1,
          currentStreakDays: nextStreak,
          longestStreakDays: Math.max(current.longestStreakDays, nextStreak),
          lastActionDate: today,
        };

        set((state) => ({
          byUser: {
            ...state.byUser,
            [userId]: next,
          },
        }));
      },
    }),
    {
      name: "flashcardengine-streak",
    }
  )
);