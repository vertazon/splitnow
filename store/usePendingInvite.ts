import { create } from 'zustand';

/**
 * Holds an invite code that arrived via deep link while the user was
 * unauthenticated. After auth completes, the root layout reads this,
 * clears it, and navigates to /join/<code> to process the friendship.
 */
interface PendingInviteState {
  pendingCode: string | null;
  setCode: (code: string) => void;
  clearCode: () => void;
}

export const usePendingInvite = create<PendingInviteState>(set => ({
  pendingCode: null,
  setCode: (code) => set({ pendingCode: code }),
  clearCode: () => set({ pendingCode: null }),
}));
