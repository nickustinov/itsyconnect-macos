"use client";

import { useRef, useEffect, useCallback, useSyncExternalStore } from "react";
import { readReviewsPlatform } from "@/components/layout/header-version-picker";
import { registerKnownReviews } from "./use-seen-reviews";

const STORAGE_KEY_PREFIX = "reviews-seen:";
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

function seenKey(appId: string): string {
  const platform = readReviewsPlatform(appId);
  return platform ? `${STORAGE_KEY_PREFIX}${appId}:${platform}` : `${STORAGE_KEY_PREFIX}${appId}`;
}

function getSeenCount(appId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(seenKey(appId));
  return raw ? parseInt(raw, 10) || 0 : 0;
}

function setSeenCount(appId: string, count: number): void {
  localStorage.setItem(seenKey(appId), String(count));
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
        const platform = readReviewsPlatform(appId);
        const params = new URLSearchParams({ sort: "newest" });
        if (platform) params.set("platform", platform);
        const res = await fetch(`/api/apps/${appId}/reviews?${params}`);
        if (!res.ok) continue;
        const data = await res.json();
        const reviews = data.reviews ?? [];
        const total = reviews.length;
        const seen = getSeenCount(appId);
        notifyBadgeChange(appId, total > seen);
        registerKnownReviews(appId, reviews.map((r: { id: string }) => r.id));
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

const EMPTY_BADGE_STATE: Record<string, boolean> = {};

function getServerBadgeSnapshot() {
  return EMPTY_BADGE_STATE;
}

/**
 * Check if a specific app has unread reviews.
 */
export function useHasUnreadReviews(appId: string): boolean {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerBadgeSnapshot);
  return state[appId] ?? false;
}

/**
 * Mark reviews as read for an app (call when user visits the reviews page).
 */
export function useMarkReviewsRead(appId: string, reviewCount: number) {
  const markedRef = useRef(false);

  useEffect(() => {
    if (reviewCount > 0 && !markedRef.current) {
      setSeenCount(appId, reviewCount);
      notifyBadgeChange(appId, false);
      markedRef.current = true;
    }
  }, [appId, reviewCount]);
}
