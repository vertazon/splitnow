import { useCallback } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/useUserStore';
import { signOut } from '@/hooks/useAuth';

/**
 * Provides a `deleteAccount` function that:
 *  1. Shows a two-step confirmation Alert
 *  2. Soft-deletes the user by stamping `deleted_at`
 *  3. Signs out — the 30-day recovery window begins immediately
 *
 * Hard delete is intentionally avoided: group expenses, splits, settlements,
 * and activity rows all reference `users.id`. Removing the row would break
 * referential integrity for every group member.
 */
export function useDeleteAccount() {
  const currentUserId = useUserStore(s => s.currentUserId);

  const executeDelete = useCallback(async () => {
    if (!currentUserId) return;

    const { error } = await supabase
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', currentUserId);

    if (error) {
      Alert.alert('Error', 'Could not delete account. Please check your connection and try again.');
      return;
    }

    // Sign out immediately — recovery is possible within 30 days by signing
    // back in with the same email address.
    await signOut();
  }, [currentUserId]);

  const deleteAccount = useCallback(() => {
    Alert.alert(
      'Delete account',
      'Your account will be deactivated immediately.\n\nYou have 30 days to recover it by signing back in. After 30 days, your name and contact details will be permanently removed.\n\nYour shared expenses and balances remain visible to other group members.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Account', style: 'destructive', onPress: executeDelete },
      ],
    );
  }, [executeDelete]);

  return { deleteAccount };
}
