import { createContext, useContext, useState, ReactNode } from 'react';
import type { Expense, ExpenseComment } from '@/constants/sampleData';
import { recentExpenses as seedExpenses } from '@/constants/sampleData';

interface AppContextValue {
  expenses: Expense[];
  addExpense: (exp: Expense) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  addComment: (expenseId: string, comment: ExpenseComment) => void;
}

const AppContext = createContext<AppContextValue>({
  expenses: seedExpenses,
  addExpense: () => {},
  updateExpense: () => {},
  deleteExpense: () => {},
  addComment: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [expenses, setExpenses] = useState<Expense[]>(seedExpenses);

  const addExpense = (exp: Expense) =>
    setExpenses(prev => [exp, ...prev]);

  const updateExpense = (id: string, updates: Partial<Expense>) =>
    setExpenses(prev =>
      prev.map(e => e.id === id ? { ...e, ...updates } : e)
    );

  const deleteExpense = (id: string) =>
    setExpenses(prev => prev.filter(e => e.id !== id));

  const addComment = (expenseId: string, comment: ExpenseComment) =>
    setExpenses(prev =>
      prev.map(e =>
        e.id === expenseId
          ? { ...e, comments: [...(e.comments ?? []), comment] }
          : e
      )
    );

  return (
    <AppContext.Provider value={{ expenses, addExpense, updateExpense, deleteExpense, addComment }}>
      {children}
    </AppContext.Provider>
  );
}

export const useAppContext = () => useContext(AppContext);
