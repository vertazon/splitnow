// SplitNow database types
// Mirror of the schema in supabase/schema.sql + 02_auth_rls.sql.

export type AvatarColor = 'green' | 'blue' | 'purple' | 'orange';

export type SubscriptionPlan   = 'free' | 'pro' | 'teams';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';

export interface User {
  id: string;
  /** Null until the user completes the profile-setup screen after OTP. */
  name: string | null;
  phone: string | null;
  upi_id: string | null;
  avatar_color: AvatarColor;
  created_at: string;
  // ── Subscription ──────────────────────────────────────────────────────────
  subscription_plan:    SubscriptionPlan;
  subscription_status:  SubscriptionStatus;
  /** UTC timestamp when the current paid period ends. Null for free plan. */
  subscription_period_end:  string | null;
  /** UTC timestamp when any active trial ends. */
  trial_end:                string | null;
  razorpay_customer_id:     string | null;
  razorpay_subscription_id: string | null;
}

export interface Group {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
}

export interface Expense {
  id: string;
  group_id: string;
  title: string;
  amount: number;
  category: string;
  paid_by: string | null;
  added_by: string | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  amount_owed: number;
  settled: boolean;
}

export interface ExpenseComment {
  id: string;
  expense_id: string;
  user_id: string;
  text: string;
  created_at: string;
}

export interface Settlement {
  id: string;
  group_id: string | null;
  from_user: string | null;
  to_user: string | null;
  amount: number;
  settled_at: string;
  upi_ref: string | null;
}

// Computed: per-counterparty net for the current user.
// Positive amount = they owe you. Negative = you owe them.
export interface Balance {
  userId: string;
  name: string;
  amount: number;
  upiId: string | null;
  avatarColor: AvatarColor;
}

// Insert payloads (everything DB-generated is optional)
export type UserInsert       = Omit<User, 'id' | 'created_at'>     & Partial<Pick<User, 'id' | 'created_at'>>;
export type GroupInsert      = Omit<Group, 'id' | 'created_at'>    & Partial<Pick<Group, 'id' | 'created_at'>>;
export type ExpenseInsert    = Omit<Expense, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<Expense, 'id' | 'created_at' | 'updated_at'>>;
export type SplitInsert      = Omit<ExpenseSplit, 'id' | 'settled'> & Partial<Pick<ExpenseSplit, 'id' | 'settled'>>;
export type CommentInsert    = Omit<ExpenseComment, 'id' | 'created_at'> & Partial<Pick<ExpenseComment, 'id' | 'created_at'>>;
export type SettlementInsert = Omit<Settlement, 'id' | 'settled_at'> & Partial<Pick<Settlement, 'id' | 'settled_at'>>;

// Minimal Database type for Supabase client generic. Expand as needed.
export interface Database {
  public: {
    Tables: {
      users:             { Row: User;            Insert: UserInsert;       Update: Partial<User> };
      groups:            { Row: Group;           Insert: GroupInsert;      Update: Partial<Group> };
      group_members:     { Row: GroupMember;     Insert: GroupMember;      Update: Partial<GroupMember> };
      expenses:          { Row: Expense;         Insert: ExpenseInsert;    Update: Partial<Expense> };
      expense_splits:    { Row: ExpenseSplit;    Insert: SplitInsert;      Update: Partial<ExpenseSplit> };
      expense_comments:  { Row: ExpenseComment;  Insert: CommentInsert;    Update: Partial<ExpenseComment> };
      settlements:       { Row: Settlement;      Insert: SettlementInsert; Update: Partial<Settlement> };
    };
  };
}
