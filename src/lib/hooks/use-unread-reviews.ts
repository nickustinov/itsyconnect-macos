"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY_PREFIX = "reviews-seen:";
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

function getSeenCount(appId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${appId}`);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

function setSeenCount(appId: string, count: number): void {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${appId}`, String(count));
}

// External store for cross-component reactivity
let listeners: Array<() => void> = [];
let badgeState: Record<string, boolean> = {};

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot() {
  return badgeState;
}

function notifyBadgeChange(appId: string, hasUnread: boolean) {
  if (badgeState[appId] === hasUnread) return;
  badgeState = { ...badgeState, [appId]: hasUnread };
  for (const listener of listeners) listener();
}

/**
 * Hook to poll review counts and track unread state.
 * Call this from the dashboard layout so it polls in the background.
 */
export function useUnreadReviewsPoller(appIds: string[]) {
  const checkAll = useCallback(async () => {
    for (const appId of appIds) {
      try {
        const res = await fetch(`/api/apps/${appId}/reviews?sort=newest`);
        if (!res.ok) continue;
        const data = await res.json();
        const total = data.reviews?.length ?? 0;
        const seen = getSeenCount(appId);
        notifyBadgeChange(appId, total > seen);
      } catch {
        // Silently fail – don't block the UI
      }
    }
  }, [appIds]);

  useEffect(() => {
    if (appIds.length === 0) return;
    checkAll();
    const timer = setInterval(checkAll, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [appIds, checkAll]);
}

/**
 * Check if a specific app has unread reviews.
 */
export function useHasUnreadReviews(appId: string): boolean {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return state[appId] ?? false;
}

/**
 * Mark reviews as read for an app (call when user visits the reviews page).
 */
export function useMarkReviewsRead(appId: string, reviewCount: number) {
  const [marked, setMarked] = useState(false);

  useEffect(() => {
    if (reviewCount > 0 && !marked) {
      setSeenCount(appId, reviewCount);
      notifyBadgeChange(appId, false);
      setMarked(true);
    }
  }, [appId, reviewCount, marked]);
}
