/**
 * SplitNow subscription plans — India-first pricing via Razorpay.
 *
 * Billing integration (Razorpay Subscriptions API) is Phase 7.
 * This file only defines limits and helper hooks so every screen
 * can gate features without knowing the billing details.
 */
import { useMemo } from 'react';
import { useUserStore } from '@/store/useUserStore';
import type { SubscriptionPlan, SubscriptionStatus, User } from '@/types/database';

// ─── Plan catalogue ───────────────────────────────────────────────────────────

export interface Plan {
  id: SubscriptionPlan;
  label: string;
  priceMonthly: number;      // INR, 0 for free
  priceAnnual: number;       // INR, 0 for free
  features: PlanFeatures;
}

export interface PlanFeatures {
  maxGroups: number;         // Infinity = unlimited
  maxMembersPerGroup: number;
  historyDays: number;       // Infinity = full history
  insightsEnabled: boolean;
  canExport: boolean;
  multiAdmin: boolean;
}

export const PLANS: Record<SubscriptionPlan, Plan> = {
  free: {
    id: 'free',
    label: 'Free',
    priceMonthly: 0,
    priceAnnual: 0,
    features: {
      maxGroups: 1,
      maxMembersPerGroup: 5,
      historyDays: 30,
      insightsEnabled: false,
      canExport: false,
      multiAdmin: false,
    },
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    priceMonthly: 99,
    priceAnnual: 999,          // ~2 months free
    features: {
      maxGroups: Infinity,
      maxMembersPerGroup: Infinity,
      historyDays: Infinity,
      insightsEnabled: true,
      canExport: true,
      multiAdmin: false,
    },
  },
  teams: {
    id: 'teams',
    label: 'Teams',
    priceMonthly: 299,
    priceAnnual: 2999,
    features: {
      maxGroups: Infinity,
      maxMembersPerGroup: Infinity,
      historyDays: Infinity,
      insightsEnabled: true,
      canExport: true,
      multiAdmin: true,
    },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when the user has an active paid subscription (pro or teams). */
export function isSubscriptionActive(
  plan: SubscriptionPlan,
  status: SubscriptionStatus,
  periodEnd: string | null,
): boolean {
  if (plan === 'free') return false;
  if (!['active', 'trialing'].includes(status)) return false;
  if (periodEnd && new Date(periodEnd) < new Date()) return false;
  return true;
}

/** Effective plan features for a user — degrades to free if subscription lapsed. */
export function effectiveFeatures(user: Pick<User,
  'subscription_plan' | 'subscription_status' | 'subscription_period_end'
>): PlanFeatures {
  const active = isSubscriptionActive(
    user.subscription_plan,
    user.subscription_status,
    user.subscription_period_end,
  );
  const effectivePlan = active ? user.subscription_plan : 'free';
  return PLANS[effectivePlan].features;
}

// ─── React hooks ─────────────────────────────────────────────────────────────

/** Returns the effective plan features for the current user. */
export function usePlanFeatures(): PlanFeatures {
  const currentUser = useUserStore(s => s.currentUser);
  return useMemo(() => {
    if (!currentUser) return PLANS.free.features;
    return effectiveFeatures(currentUser);
  }, [currentUser]);
}

/** Returns true when the current user can access the Insights tab. */
export function useInsightsEnabled(): boolean {
  return usePlanFeatures().insightsEnabled;
}

/** Returns true when the current user is on a paid plan with active billing. */
export function useIsPro(): boolean {
  const currentUser = useUserStore(s => s.currentUser);
  if (!currentUser) return false;
  return isSubscriptionActive(
    currentUser.subscription_plan,
    currentUser.subscription_status,
    currentUser.subscription_period_end,
  );
}
