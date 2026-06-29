"use client";

import { useSyncExternalStore, useCallback } from "react";

/**
 * Per-review "seen" state for the Review center, persisted in localStorage.
 * A review is unseen until marked seen; the center shows unseen reviews and the
 * sidebar badge counts them. Marking unseen (from a per-app reviews list) returns
 * a review to the center.
 */

const STORAGE_KEY = "review-center:seen";
const EMPTY_SET: ReadonlySet<string> = new Set();

let seenIds = new Set<string>();
let loaded = false;
// All known review IDs per app (registered by the poller and the review center).
let reviewIdsByApp: Record<string, string[]> = {};
let unseenCount = 0;

let seenListeners: Array<() => void> = [];
let countListeners: Array<() => void> = [];

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) seenIds = new Set(JSON.parse(raw));
  } catch { /* ignore */ }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seenIds]));
  } catch { /* ignore */ }
}

function recomputeCount() {
  const all = new Set<string>();
  for (const ids of Object.values(reviewIdsByApp)) for (const id of ids) all.add(id);
  let count = 0;
  for (const id of all) if (!seenIds.has(id)) count++;
  if (count === unseenCount) return;
  unseenCount = count;
  for (const l of countListeners) l();
}

function applySeen(next: Set<string>) {
  seenIds = next;
  persist();
  for (const l of seenListeners) l();
  recomputeCount();
}

function markSeen(ids: string[]) {
  load();
  const next = new Set(seenIds);
  let changed = false;
  for (const id of ids) if (!next.has(id)) { next.add(id); changed = true; }
  if (changed) applySeen(next);
}

function markUnseen(ids: string[]) {
  load();
  const next = new Set(seenIds);
  let changed = false;
  for (const id of ids) if (next.delete(id)) changed = true;
  if (changed) applySeen(next);
}

/** Register the full set of review IDs for an app so the unseen count is accurate. */
export function registerKnownReviews(appId: string, ids: string[]) {
  load();
  const prev = reviewIdsByApp[appId];
  if (prev && prev.length === ids.length && prev.every((v, i) => v === ids[i])) return;
  reviewIdsByApp = { ...reviewIdsByApp, [appId]: ids };
  recomputeCount();
}

function subscribeSeen(listener: () => void) {
  if (!loaded) { load(); recomputeCount(); }
  seenListeners = [...seenListeners, listener];
  return () => { seenListeners = seenListeners.filter((l) => l !== listener); };
}

function subscribeCount(listener: () => void) {
  if (!loaded) { load(); recomputeCount(); }
  countListeners = [...countListeners, listener];
  return () => { countListeners = countListeners.filter((l) => l !== listener); };
}

export interface SeenReviewsApi {
  seen: ReadonlySet<string>;
  markSeen: (ids: string[]) => void;
  markUnseen: (ids: string[]) => void;
}

export function useSeenReviews(): SeenReviewsApi {
  const seen = useSyncExternalStore(subscribeSeen, () => seenIds, () => EMPTY_SET);
  return {
    seen,
    markSeen: useCallback((ids: string[]) => markSeen(ids), []),
    markUnseen: useCallback((ids: string[]) => markUnseen(ids), []),
  };
}

/** Total unseen reviews across all apps (for the sidebar badge). */
export function useGlobalUnseenCount(): number {
  return useSyncExternalStore(subscribeCount, () => unseenCount, () => 0);
}
