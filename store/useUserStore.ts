import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@/types/database';

interface UserState {
  /** auth.users UUID — set as soon as the session is known. */
  currentUserId: string | null;
  /** Full public.users profile — set after the profile row is fetched. */
  currentUser: User | null;
  isLoading: boolean;
  setCurrentUserId: (id: string | null) => void;
  setCurrentUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  clearUser: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      currentUserId: null,
      currentUser: null,
      isLoading: true,   // true until the first session check resolves
      setCurrentUserId: (id) => set({ currentUserId: id }),
      setCurrentUser: (user) => set({ currentUser: user, currentUserId: user?.id ?? null }),
      setLoading: (loading) => set({ isLoading: loading }),
      clearUser: () => set({ currentUserId: null, currentUser: null }),
    }),
    {
      name: 'splitnow.user',
      storage: createJSONStorage(() => AsyncStorage),
      // isLoading is derived from session check — never persist it.
      partialize: (s) => ({ currentUserId: s.currentUserId, currentUser: s.currentUser }),
    },
  ),
);
