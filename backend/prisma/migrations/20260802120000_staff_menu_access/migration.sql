-- Which screens an account may see. Visibility only — never a permission.
-- Existing accounts start with an empty array; `effectiveMenu()` falls back to
-- the default staff menu for a STAFF row that has never been assigned one, so
-- nobody who could sign in yesterday is locked out of their tabs today.
ALTER TABLE "users" ADD COLUMN "menuAccess" JSONB NOT NULL DEFAULT '[]';
