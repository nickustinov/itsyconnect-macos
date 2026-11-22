-- 1.14.3 counts every App Store source type and keeps proceeds per territory
-- and day. Clearing the marks makes each app run its history backfill once
-- more, so days cached before the upgrade are aggregated again.
DELETE FROM `analytics_backfill`;
