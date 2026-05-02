import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface GroupState {
  currentGroupId: string | null;
  setCurrentGroupId: (id: string) => void;
  clearGroup: () => void;
}

export const useGroupStore = create<GroupState>()(
  persist(
    (set) => ({
      currentGroupId: null,
      setCurrentGroupId: (id) => set({ currentGroupId: id }),
      clearGroup: () => set({ currentGroupId: null }),
    }),
    {
      name: 'splitnow.group',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
