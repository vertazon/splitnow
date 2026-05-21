export type MemberColor = 'green' | 'blue' | 'purple' | 'orange';

export interface Member {
  id: string;
  name: string;
  initials: string;
  color: MemberColor;
  vpa?: string;
}

export interface Balance {
  memberId: string;
  amount: number; // negative = you owe, positive = they owe you
}

export interface ExpenseComment {
  id: string;
  memberId: string;
  text: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  emoji: string;
  title: string;
  amount: number;
  date: string;
  people?: string;       // legacy display label (kept for compat)
  isIncome?: boolean;
  category?: string;     // category id e.g. 'food'
  paidBy?: string;       // member id e.g. 'aryan'
  splitWith?: string[];  // member ids including payer
  note?: string;
  createdAt?: string;    // ISO datetime
  addedBy?: string;      // member id of who logged the entry
  updatedAt?: string;    // ISO datetime, set on edits
  comments?: ExpenseComment[];
}

export interface Category {
  id: string;
  emoji: string;
  label: string;
  group: string;
}

export const members: Member[] = [
  { id: 'aryan',  name: 'Aryan',  initials: 'AR', color: 'green' },
  { id: 'raj',    name: 'Raj',    initials: 'RJ', color: 'blue',   vpa: 'raj@okaxis' },
  { id: 'priya',  name: 'Priya',  initials: 'PR', color: 'purple' },
  { id: 'arjun',  name: 'Arjun',  initials: 'AJ', color: 'orange', vpa: 'arjun@ybl' },
  { id: 'deepak', name: 'Deepak', initials: 'DK', color: 'blue' },
];

export const balances: Balance[] = [
  { memberId: 'raj',   amount: -640 },
  { memberId: 'priya', amount: 300  },
  { memberId: 'arjun', amount: -900 },
];

export const netBalance = balances.reduce((sum, b) => sum + b.amount, 0); // −1,240

export const recentExpenses: Expense[] = [
  {
    id: '1', emoji: '🛒', title: 'Groceries', amount: 420, date: 'Yesterday',
    people: 'Raj, Priya', category: 'groceries', paidBy: 'aryan',
    splitWith: ['aryan', 'raj', 'priya'],
    addedBy: 'aryan', createdAt: '2026-04-25T09:14:00.000Z',
    comments: [
      { id: 'c1', memberId: 'raj',   text: 'Can we get more dal next time?', createdAt: '2026-04-25T09:30:00.000Z' },
      { id: 'c2', memberId: 'aryan', text: 'Sure, added it to the list!',    createdAt: '2026-04-25T09:45:00.000Z' },
      { id: 'c3', memberId: 'priya', text: 'Also grab some paneer please 🙏', createdAt: '2026-04-25T10:02:00.000Z' },
    ],
  },
  {
    id: '2', emoji: '🍛', title: 'Dinner · BBQ Nation', amount: 680, date: 'Monday',
    people: 'All', category: 'food', paidBy: 'raj',
    splitWith: ['aryan', 'raj', 'priya', 'arjun'],
    addedBy: 'raj', createdAt: '2026-04-21T20:42:00.000Z',
    comments: [
      { id: 'c4', memberId: 'priya', text: 'Great dinner! When do we settle up?', createdAt: '2026-04-21T21:05:00.000Z' },
      { id: 'c5', memberId: 'raj',   text: 'Let\'s do it this weekend',           createdAt: '2026-04-21T21:08:00.000Z' },
    ],
  },
  {
    id: '3', emoji: '⚡', title: 'Electricity Bill', amount: 300, date: 'Apr 18',
    people: 'Arjun paid you', isIncome: true, category: 'bills', paidBy: 'arjun',
    splitWith: ['aryan', 'arjun'],
    addedBy: 'arjun', createdAt: '2026-04-18T11:05:00.000Z',
    updatedAt: '2026-04-18T11:22:00.000Z',
  },
];

export const personalExpenses: Expense[] = [
  { id: '4', emoji: '☕', title: 'Chai (CCD)',   amount: 80,  date: 'Today',  category: 'chai',     paidBy: 'aryan', splitWith: ['aryan'], addedBy: 'aryan', createdAt: '2026-04-26T08:30:00.000Z' },
  { id: '5', emoji: '📱', title: 'Jio Recharge', amount: 299, date: 'Apr 22', category: 'recharge', paidBy: 'aryan', splitWith: ['aryan'], addedBy: 'aryan', createdAt: '2026-04-22T18:10:00.000Z' },
  { id: '6', emoji: '🚗', title: 'Ola cab',      amount: 161, date: 'Apr 21', category: 'travel',   paidBy: 'aryan', splitWith: ['aryan'], addedBy: 'aryan', createdAt: '2026-04-21T14:55:00.000Z' },
];

export const categoryGroups: { id: string; label: string }[] = [
  { id: 'food',          label: 'Food & Drinks' },
  { id: 'travel',        label: 'Travel' },
  { id: 'bills',         label: 'Bills & Utilities' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'shopping',      label: 'Shopping' },
  { id: 'other',         label: 'Other' },
];

// First 9 are shown in the quick grid; rest accessible via "More"
export const categories: Category[] = [
  // ── top 9 (quick grid) ──
  { id: 'food',          emoji: '🍛', label: 'Food',          group: 'food' },
  { id: 'groceries',     emoji: '🛒', label: 'Groceries',     group: 'food' },
  { id: 'travel',        emoji: '🚗', label: 'Cab/Auto',      group: 'travel' },
  { id: 'bills',         emoji: '⚡', label: 'Electricity',   group: 'bills' },
  { id: 'chai',          emoji: '☕', label: 'Chai/Coffee',   group: 'food' },
  { id: 'recharge',      emoji: '📱', label: 'Recharge',      group: 'bills' },
  { id: 'entertainment', emoji: '🎬', label: 'Movies',        group: 'entertainment' },
  { id: 'shopping',      emoji: '🛍️', label: 'Shopping',      group: 'shopping' },
  { id: 'rent',          emoji: '🏠', label: 'Rent/EMI',      group: 'bills' },
  // ── more ──
  { id: 'dining',        emoji: '🍽️', label: 'Dining Out',    group: 'food' },
  { id: 'drinks',        emoji: '🍺', label: 'Drinks',        group: 'food' },
  { id: 'sweets',        emoji: '🍰', label: 'Sweets',        group: 'food' },
  { id: 'flight',        emoji: '✈️', label: 'Flight',        group: 'travel' },
  { id: 'metro',         emoji: '🚇', label: 'Metro/Bus',     group: 'travel' },
  { id: 'fuel',          emoji: '⛽', label: 'Fuel',          group: 'travel' },
  { id: 'hotel',         emoji: '🏨', label: 'Hotel',         group: 'travel' },
  { id: 'internet',      emoji: '🌐', label: 'Internet',      group: 'bills' },
  { id: 'subscriptions', emoji: '📺', label: 'Subscriptions', group: 'bills' },
  { id: 'water',         emoji: '💧', label: 'Water Bill',    group: 'bills' },
  { id: 'gym',           emoji: '🏋️', label: 'Gym',           group: 'entertainment' },
  { id: 'party',         emoji: '🎉', label: 'Party',         group: 'entertainment' },
  { id: 'gaming',        emoji: '🎮', label: 'Gaming',        group: 'entertainment' },
  { id: 'sports',        emoji: '🏏', label: 'Sports',        group: 'entertainment' },
  { id: 'health',        emoji: '💊', label: 'Health',        group: 'shopping' },
  { id: 'personal',      emoji: '🧴', label: 'Personal Care', group: 'shopping' },
  { id: 'clothing',      emoji: '👕', label: 'Clothing',      group: 'shopping' },
  { id: 'gifts',         emoji: '🎁', label: 'Gifts',         group: 'other' },
  { id: 'misc',          emoji: '📦', label: 'Misc',          group: 'other' },
];

export const insightsData = {
  totalMonth: 4280,
  expenses: 14,
  mostWith: 'Raj',
  mostWithCount: 6,
  avgDay: 214,
  byCategory: [
    { label: '🍛 Food',       amount: 1840, pct: 1.00,  color: '#00D6A0' },
    { label: '🛒 Groceries',  amount: 1120, pct: 0.609, color: '#5B9FFF' },
    { label: '⚡ Bills',       amount: 780,  pct: 0.424, color: '#FF9A3C' },
    { label: '🚗 Travel',     amount: 540,  pct: 0.293, color: '#A87CFF' },
  ],
};

export function formatAmount(n: number): string {
  return '₹' + Math.abs(n).toLocaleString('en-IN');
}

export function formatSigned(n: number): string {
  if (n >= 0) return '+₹' + n.toLocaleString('en-IN');
  return '−₹' + Math.abs(n).toLocaleString('en-IN');
}
