import { create } from 'zustand';
import type { Balance } from '@/types/database';

interface BalanceState {
  balances: Balance[];
  netBalance: number;
  isLoading: boolean;
  setBalances: (balances: Balance[]) => void;
  setLoading: (loading: boolean) => void;
  computeNetBalance: () => void;
}

export const useBalanceStore = create<BalanceState>((set, get) => ({
  balances: [],
  netBalance: 0,
  isLoading: false,
  setBalances: (balances) => {
    const net = balances.reduce((sum, b) => sum + b.amount, 0);
    set({ balances, netBalance: net });
  },
  setLoading: (loading) => set({ isLoading: loading }),
  computeNetBalance: () => {
    const net = get().balances.reduce((sum, b) => sum + b.amount, 0);
    set({ netBalance: net });
  },
}));
