import { create } from 'zustand';
import type { Group, User } from '@/types/database';
import { CURRENT_GROUP_ID } from '@/lib/auth';

interface GroupState {
  currentGroupId: string;
  currentGroup: Group | null;
  members: User[];
  setGroup: (group: Group | null) => void;
  setMembers: (members: User[]) => void;
}

export const useGroupStore = create<GroupState>((set) => ({
  // Hardcoded for the prototype phase — see lib/auth.ts.
  currentGroupId: CURRENT_GROUP_ID,
  currentGroup: null,
  members: [],
  setGroup: (group) => set({ currentGroup: group }),
  setMembers: (members) => set({ members }),
}));
