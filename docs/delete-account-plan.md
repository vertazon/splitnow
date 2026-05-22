# Account Deletion & Recovery Feature - Implementation Plan

## Overview
Implement soft delete with 30-day grace period for SplitNow user accounts.

## Key Requirements
- Instant UI anonymization (show "Deleted User" immediately)
- 30-day recovery window
- Automated cleanup after 30 days
- Preserve balances and expense history for group integrity
- No data loss for other group members

---

## Database Changes

### 1. Add Columns to users Table
```sql
ALTER TABLE users 
ADD COLUMN deleted_at timestamptz,
ADD COLUMN anonymized_at timestamptz;

CREATE INDEX idx_users_deleted_pending 
ON users(deleted_at) 
WHERE deleted_at IS NOT NULL AND anonymized_at IS NULL;
```

### 2. Create Anonymized View
```sql
CREATE OR REPLACE VIEW users_display AS
SELECT 
  id,
  CASE 
    WHEN deleted_at IS NOT NULL THEN 'Deleted User'
    ELSE name
  END AS name,
  CASE 
    WHEN deleted_at IS NOT NULL THEN NULL
    ELSE phone
  END AS phone,
  CASE 
    WHEN deleted_at IS NOT NULL THEN NULL
    ELSE upi_id
  END AS upi_id,
  CASE
    WHEN deleted_at IS NOT NULL THEN 'grey'
    ELSE avatar_color
  END AS avatar_color,
  invite_code,
  created_at,
  deleted_at,
  anonymized_at
FROM users;

GRANT SELECT ON users_display TO authenticated;
GRANT SELECT ON users_display TO anon;
```

---

## React Native Implementation

### 3. Create useUserDisplay Hook
**File:** `hooks/useUserDisplay.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useUserDisplay(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-display', userId],
    queryFn: async () => {
      if (!userId) return null
      const { data, error } = await supabase
        .from('users_display')
        .select('*')
        .eq('id', userId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  })
}

export function useUsersDisplay(userIds: string[]) {
  return useQuery({
    queryKey: ['users-display', userIds.sort().join(',')],
    queryFn: async () => {
      if (userIds.length === 0) return []
      const { data, error } = await supabase
        .from('users_display')
        .select('*')
        .in('id', userIds)
      if (error) throw error
      return data
    },
    enabled: userIds.length > 0,
    staleTime: 1000 * 60 * 5,
  })
}

export type UserDisplay = {
  id: string
  name: string
  phone: string | null
  upi_id: string | null
  avatar_color: string
  invite_code: string | null
  created_at: string
  deleted_at: string | null
  anonymized_at: string | null
}
```

### 4. Create useDeleteAccount Hook
**File:** `hooks/useDeleteAccount.ts`

```typescript
import { Alert } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { router } from 'expo-router'

export function useDeleteAccount() {
  const { user } = useAuth()

  const deleteAccount = () => {
    Alert.alert(
      'Delete account',
      'Your account will be deactivated immediately. You have 30 days to recover it by signing back in.\n\nAfter 30 days, your name, phone number, and UPI ID will be permanently removed.\n\nYour shared expenses and balances will remain visible to others as "Deleted User".',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Account', style: 'destructive', onPress: executeDelete },
      ]
    )
  }

  const executeDelete = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'User session not found')
      return
    }

    try {
      const { error } = await supabase
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', user.id)

      if (error) throw error

      await supabase.auth.signOut()
      router.replace('/(auth)/phone')

      setTimeout(() => {
        Alert.alert(
          'Account deleted',
          'You have 30 days to recover your account by signing back in with the same phone number.'
        )
      }, 500)
    } catch (err) {
      console.error('Delete account failed:', err)
      Alert.alert('Error', 'Could not delete account. Please check your connection and try again.')
    }
  }

  return { deleteAccount }
}
```

### 5. Create useAccountRecovery Hook
**File:** `hooks/useAccountRecovery.ts`

```typescript
import { Alert } from 'react-native'
import { supabase } from '@/lib/supabase'
import { router } from 'expo-router'

export async function checkAccountRecovery(userId: string): Promise<boolean> {
  try {
    const { data: userData, error } = await supabase
      .from('users')
      .select('deleted_at, anonymized_at, name')
      .eq('id', userId)
      .single()

    if (error) throw error
    if (!userData?.deleted_at) return true

    const deletedDate = new Date(userData.deleted_at)
    const daysSinceDeletion = Math.floor(
      (Date.now() - deletedDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    const daysLeft = 30 - daysSinceDeletion

    if (userData.anonymized_at || daysSinceDeletion >= 30) {
      Alert.alert(
        'Account deleted',
        'Your account was permanently deleted and cannot be recovered.',
        [{ text: 'OK', onPress: () => signOutAndRedirect() }]
      )
      return false
    }

    return await showRecoveryPrompt(userId, userData.name, daysLeft)
  } catch (err) {
    console.error('Recovery check failed:', err)
    return true
  }
}

async function showRecoveryPrompt(
  userId: string,
  userName: string,
  daysLeft: number
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Recover your account?',
      `Your account "${userName}" was scheduled for deletion.\n\nYou have ${daysLeft} day${daysLeft === 1 ? '' : 's'} left to recover it.`,
      [
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: () => {
            signOutAndRedirect()
            resolve(false)
          },
        },
        {
          text: 'Recover Account',
          onPress: async () => {
            const recovered = await recoverAccount(userId)
            resolve(recovered)
          },
        },
      ]
    )
  })
}

async function recoverAccount(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('users')
      .update({ deleted_at: null })
      .eq('id', userId)

    if (error) throw error

    Alert.alert('Account recovered', 'Welcome back! Your account has been fully restored.')
    return true
  } catch (err) {
    console.error('Recovery failed:', err)
    Alert.alert('Recovery failed', 'Could not recover your account. Please try again.')
    signOutAndRedirect()
    return false
  }
}

async function signOutAndRedirect() {
  await supabase.auth.signOut()
  router.replace('/(auth)/phone')
}
```

---

## Integration Points

### 6. Update Account Screen
**File:** `app/account.tsx`

Add delete button:

```typescript
import { useDeleteAccount } from '@/hooks/useDeleteAccount'

export default function AccountScreen() {
  const { deleteAccount } = useDeleteAccount()

  return (
    <View>
      {/* Existing sections... */}
      
      {/* Danger Section */}
      <View style={styles.dangerSection}>
        <TouchableOpacity onPress={deleteAccount}>
          <View style={styles.iconBox}>
            <Text>🗑️</Text>
          </View>
          <View>
            <Text style={styles.dangerText}>Delete account</Text>
            <Text style={styles.subText}>Permanently removes your account and data</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  )
}
```

### 7. Update OTP Verification
**File:** `app/(auth)/otp.tsx` (or wherever OTP verification happens)

Add recovery check after successful verification:

```typescript
import { checkAccountRecovery } from '@/hooks/useAccountRecovery'

async function handleVerifyOTP() {
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: phoneNumber,
      token: otpCode,
      type: 'sms'
    })

    if (error) throw error
    if (!data.user) throw new Error('No user session')

    // CHECK FOR ACCOUNT RECOVERY
    const canProceed = await checkAccountRecovery(data.user.id)
    if (!canProceed) return

    // Continue normal flow
    const { data: userData } = await supabase
      .from('users')
      .select('name')
      .eq('id', data.user.id)
      .single()

    if (!userData?.name) {
      router.replace('/(auth)/profile')
    } else {
      router.replace('/(tabs)')
    }
  } catch (err) {
    Alert.alert('Error', 'Invalid code. Please try again.')
  }
}
```

### 8. Update ALL User Display Components

Replace all direct `users` table queries with `users_display` view.

**Example: Balance Row**
```typescript
import { useUserDisplay } from '@/hooks/useUserDisplay'

export function BalanceRow({ userId, amount }: Props) {
  const { data: user } = useUserDisplay(userId)
  
  if (!user) return null
  
  const isDeleted = !!user.deleted_at
  const showSettleButton = amount < 0 && !isDeleted

  return (
    <View style={styles.row}>
      <Avatar 
        color={user.avatar_color}
        style={isDeleted && { opacity: 0.4 }}
      />
      <Text style={isDeleted && { color: colors.text3 }}>
        {user.name}
      </Text>
      <Text>{formatAmount(amount)}</Text>
      {showSettleButton && <SettleButton userId={userId} />}
    </View>
  )
}
```

**Apply same pattern to:**
- Expense detail screen (paid by, split with)
- Activity feed (user names in activity items)
- Group members list
- Any component showing user names

---

## Automation (30-Day Cleanup)

### 9. Create Edge Function
**File:** `supabase/functions/cleanup-deleted-users/index.ts`

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!authHeader || !serviceRoleKey || !authHeader.includes(serviceRoleKey)) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey,
      { auth: { persistSession: false } }
    )

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id, name')
      .not('deleted_at', 'is', null)
      .lte('deleted_at', thirtyDaysAgo.toISOString())
      .is('anonymized_at', null)

    if (fetchError) throw fetchError

    const results = []
    for (const user of users || []) {
      const { error } = await supabase
        .from('users')
        .update({
          name: 'Deleted User',
          phone: null,
          upi_id: null,
          invite_code: null,
          anonymized_at: new Date().toISOString()
        })
        .eq('id', user.id)

      results.push({ id: user.id, status: error ? 'failed' : 'success' })
    }

    return new Response(JSON.stringify({
      success: true,
      anonymized_count: results.filter(r => r.status === 'success').length,
      results
    }))
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 })
  }
})
```

### 10. Deploy & Schedule

```bash
# Deploy Edge Function
supabase functions deploy cleanup-deleted-users

# Setup cron job (run in Supabase SQL Editor)
ALTER DATABASE postgres SET app.service_role_key = 'your-service-role-key';

SELECT cron.schedule(
  'cleanup-deleted-users-daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/cleanup-deleted-users',
    headers := jsonb_build_object(
      'Authorization', 
      'Bearer ' || current_setting('app.service_role_key')
    )
  );
  $$
);
```

---

## Testing Checklist

- [ ] Database migration applied
- [ ] users_display view returns correct data
- [ ] Delete button shows in Account screen
- [ ] Delete confirmation works
- [ ] User signed out after deletion
- [ ] Deleted user shows as "Deleted User" everywhere
- [ ] Recovery prompt appears within 30 days
- [ ] Recovery clears deleted_at successfully
- [ ] Recovery blocked after 30 days
- [ ] Edge Function deploys successfully
- [ ] Cron job scheduled correctly
- [ ] Balances still compute correctly with deleted users

---

## Success Metrics

**User should be able to:**
1. Delete account in 2 taps (button → confirm)
2. See "Deleted User" immediately in all UIs
3. Recover account within 30 days by logging back in
4. Not see any deleted user's PII (phone, UPI) anywhere

**System should:**
1. Preserve all expense history and balances
2. Auto-anonymize after 30 days via cron
3. Never hard-delete user rows (breaks referential integrity)

---

## Implementation Order

1. Run database migration (add columns + create view)
2. Create the 3 hooks
3. Update Account screen (add delete button)
4. Update OTP screen (add recovery check)
5. Update all user display components to use useUserDisplay
6. Deploy Edge Function
7. Set up cron job
8. Test all flows
9. Monitor for first 7 days

---

**Status:** Ready for implementation  
**Estimated effort:** 1-2 days  
**Risk level:** Low (soft delete, reversible)
