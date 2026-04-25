import { createContext, useContext, useState, ReactNode } from 'react';
import type { Expense } from '@/constants/sampleData';
import { recentExpenses as seedExpenses } from '@/constants/sampleData';

interface AppContextValue {
  expenses: Expense[];
  addExpense: (exp: Expense) => void;
}

const AppContext = createContext<AppContextValue>({
  expenses: seedExpenses,
  addExpense: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [expenses, setExpenses] = useState<Expense[]>(seedExpenses);

  const addExpense = (exp: Expense) =>
    setExpenses(prev => [exp, ...prev]);

  return (
    <AppContext.Provider value={{ expenses, addExpense }}>
      {children}
    </AppContext.Provider>
  );
}

export const useAppContext = () => useContext(AppContext);
