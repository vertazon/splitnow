import { useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';

/**
 * Returns a `safePush` function that prevents duplicate navigation pushes
 * when the user taps a row multiple times quickly.
 *
 * Once `safePush` is called, any subsequent calls within `cooldownMs`
 * (default 800 ms) are silently ignored.
 */
export function useNavGuard(cooldownMs = 800) {
  const router = useRouter();
  const navigating = useRef(false);

  const safePush = useCallback(
    (href: string) => {
      if (navigating.current) return;
      navigating.current = true;
      router.push(href as never);
      setTimeout(() => {
        navigating.current = false;
      }, cooldownMs);
    },
    [router, cooldownMs],
  );

  return { safePush };
}
