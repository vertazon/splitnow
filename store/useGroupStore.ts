import { create } from 'zustand';
import type { Group, User } from '@/types/database';

interface GroupState {
  currentGroupId: string | null;
  currentGroup: Group | null;
  members: User[];
  setCurrentGroupId: (id: string) => void;
  setGroup: (group: Group | null) => void;
  setMembers: (members: User[]) => void;
  clearGroup: () => void;
}

export const useGroupStore = create<GroupState>((set) => ({
  currentGroupId: null,
  currentGroup: null,
  members: [],
  setCurrentGroupId: (id) => set({ currentGroupId: id }),
  setGroup: (group) => set({ currentGroup: group }),
  setMembers: (members) => set({ members }),
  clearGroup: () => set({ currentGroupId: null, currentGroup: null, members: [] }),
}));
