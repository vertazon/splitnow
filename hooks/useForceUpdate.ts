import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

type UpdateState =
  | { status: 'idle' }
  | { status: 'force';  message: string; storeUrl: string }
  | { status: 'soft';   message: string; storeUrl: string };

// Compares two semver strings. Returns negative if a < b, 0 if equal, positive if a > b.
function compareSemver(a: string, b: string): number {
  const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  return aMaj !== bMaj ? aMaj - bMaj
       : aMin !== bMin ? aMin - bMin
       : aPat - bPat;
}

export function useForceUpdate() {
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' });

  useEffect(() => {
    async function check() {
      const { data, error } = await supabase
        .from('app_config')
        .select('min_version, latest_version, force_update, message, store_url_android, store_url_ios')
        .eq('id', 'default')
        .single();

      if (error || !data) return;

      const currentVersion = Constants.expoConfig?.version ?? '0.0.0';
      const storeUrl = Platform.OS === 'ios' ? data.store_url_ios : data.store_url_android;

      if (compareSemver(currentVersion, data.min_version) < 0) {
        // Below minimum — always force regardless of the flag
        setUpdateState({ status: 'force', message: data.message, storeUrl });
      } else if (compareSemver(currentVersion, data.latest_version) < 0) {
        // Below latest — force_update flag decides hard vs soft
        setUpdateState({
          status: data.force_update ? 'force' : 'soft',
          message: data.message,
          storeUrl,
        });
      }
    }

    check();
  }, []);

  return updateState;
}
