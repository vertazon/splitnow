/**
 * Centralized query-key factory.
 *
 * All TanStack Query keys live here so:
 *   - typos can't desync caches (read in one place, written in another)
 *   - hierarchical invalidation has a single source of truth
 *   - refactoring a key shape only touches this file
 *
 * Usage:
 *   useQuery({ queryKey: qk.expenses.list(groupId), ... })
 *   qc.invalidateQueries({ queryKey: qk.expenses.all })           // all expense queries
 *   qc.invalidateQueries({ queryKey: qk.expenses.list(groupId) }) // one group
 */
export const qk = {
  expenses: {
    all: ['expenses'] as const,
    list: (groupId: string | null | undefined) => ['expenses', groupId] as const,
    detail: (expenseId: string | null | undefined) => ['expense', expenseId] as const,
  },
  balances: {
    all: ['balances'] as const,
    list: (groupId: string | null | undefined, userId: string | null | undefined) =>
      ['balances', groupId, userId] as const,
  },
  settlements: {
    all: ['settlements'] as const,
    list: (groupId: string | null | undefined) => ['settlements', groupId] as const,
    detail: (id: string | null | undefined) => ['settlement', id] as const,
  },
  members: {
    all: ['members'] as const,
    list: (groupId: string | null | undefined) => ['members', groupId] as const,
  },
  friends: {
    all: ['friends'] as const,
    list: (userId: string | null | undefined) => ['friends', userId] as const,
    pair: (userId: string | null | undefined, otherId: string | null | undefined) =>
      ['areFriends', userId, otherId] as const,
  },
  groups: {
    all: ['groups'] as const,
    list: (userId: string | null | undefined) => ['groups', userId] as const,
    detail: (groupId: string | null | undefined) => ['group', groupId] as const,
    members: (groupId: string | null | undefined) => ['groupMembers', groupId] as const,
  },
  expenseHistory: {
    all: ['expenseHistory'] as const,
    list: (expenseId: string | null | undefined) => ['expenseHistory', expenseId] as const,
  },
} as const;
