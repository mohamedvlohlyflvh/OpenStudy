"use client";
import { useCallback, useEffect, useRef } from "react";

/**
 * Browser-notification reminder hook.
 *
 * - Request permission on demand (call `requestPermission()`)
 * - Schedule a one-shot notification via setTimeout
 * - If the tab is in the background, browsers throttle setTimeout
 *   aggressively — the OS may delay or skip the reminder. The hook
 *   cannot fix that, so callers should display a visible countdown
 *   and tell the user the reminder only fires while the tab is open.
 */
export function useNotificationScheduler() {
  const handleRef = useRef<number | null>(null);

  // Clear any pending timer on unmount
  useEffect(() => {
    return () => {
      if (handleRef.current !== null) {
        clearTimeout(handleRef.current);
        handleRef.current = null;
      }
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      return "denied";
    }
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    try {
      return await Notification.requestPermission();
    } catch {
      // Some browsers throw on requestPermission if not in a user gesture
      return "denied";
    }
  }, []);

  const cancel = useCallback(() => {
    if (handleRef.current !== null) {
      clearTimeout(handleRef.current);
      handleRef.current = null;
    }
  }, []);

  /**
   * Schedule a notification. Returns the delay in ms, or 0 if scheduled
   * in the past. Caller is responsible for calling `requestPermission()`
   * first (in a click handler).
   */
  const schedule = useCallback(
    (when: Date, title: string, body: string, icon?: string): number => {
      cancel();
      const delay = Math.max(0, when.getTime() - Date.now());
      if (typeof window === "undefined") return 0;
      handleRef.current = window.setTimeout(() => {
        if (typeof Notification === "undefined") return;
        if (Notification.permission !== "granted") return;
        try {
          const n = new Notification(title, {
            body,
            icon: icon ?? "/icon-192.png",
            badge: "/icon-192.png",
          });
          n.onclick = () => {
            try { window.focus(); } catch {}
            try { n.close(); } catch {}
          };
        } catch {
          // Some browsers throw if Notification is called from a non-user-gesture context
        }
      }, delay);
      return delay;
    },
    [cancel]
  );

  return { requestPermission, schedule, cancel };
}
