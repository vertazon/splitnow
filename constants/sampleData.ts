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

export interface Expense {
  id: string;
  emoji: string;
  title: string;
  amount: number;
  date: string;
  people?: string;
  isIncome?: boolean;
}

export interface Category {
  id: string;
  emoji: string;
  label: string;
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
  { id: '1', emoji: '🛒', title: 'Groceries',         amount: 420, date: 'Yesterday', people: 'Raj, Priya' },
  { id: '2', emoji: '🍛', title: 'Dinner · BBQ Nation', amount: 680, date: 'Monday',    people: 'All' },
  { id: '3', emoji: '⚡', title: 'Electricity Bill',   amount: 300, date: 'Apr 18',    people: 'Arjun paid you', isIncome: true },
];

export const personalExpenses: Expense[] = [
  { id: '4', emoji: '☕', title: 'Chai (CCD)',    amount: 80,  date: 'Today'  },
  { id: '5', emoji: '📱', title: 'Jio Recharge',  amount: 299, date: 'Apr 22' },
  { id: '6', emoji: '🚗', title: 'Ola cab',       amount: 161, date: 'Apr 21' },
];

export const categories: Category[] = [
  { id: 'food',          emoji: '🍛', label: 'Food' },
  { id: 'groceries',     emoji: '🛒', label: 'Groceries' },
  { id: 'travel',        emoji: '🚗', label: 'Travel' },
  { id: 'bills',         emoji: '⚡', label: 'Bills' },
  { id: 'chai',          emoji: '☕', label: 'Chai/Coffee' },
  { id: 'recharge',      emoji: '📱', label: 'Recharge' },
  { id: 'entertainment', emoji: '🎬', label: 'Entertainment' },
  { id: 'shopping',      emoji: '🛍️', label: 'Shopping' },
  { id: 'rent',          emoji: '🏠', label: 'Rent/EMI' },
  { id: 'health',        emoji: '💊', label: 'Health' },
  { id: 'fuel',          emoji: '⛽', label: 'Fuel' },
  { id: 'misc',          emoji: '📦', label: 'Misc' },
];

export const insightsData = {
  totalMonth: 4280,
  expenses: 14,
  mostWith: 'Raj',
  mostWithCount: 6,
  avgDay: 214,
  byCategory: [
    { label: '🍛 Food',       amount: 1840, pct: 1.00,  color: '#00D49A' },
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
