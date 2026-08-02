-- Canonicalise customer phone numbers to +91XXXXXXXXXX.
--
-- Why: "is this number already in the system?" is unanswerable while the same
-- line is stored two ways. Seeded customers carried `+919820000001` and the
-- billing screen recorded walk-ins as `9998887771`, so an equality lookup
-- matched neither against the other, and every returning walk-in would have
-- become a second customer record.
--
-- Two guards, both deliberate:
--
-- 1. Only an UNAMBIGUOUS Indian mobile is rewritten — ten digits starting 6–9,
--    optionally already carrying a 91 country code. A number written with a
--    leading trunk zero is left alone, because `0` + ten digits starting 6–9
--    is exactly the shape of an Ahmedabad landline (079-26578899) as well as
--    a mobile (09998887771), and nothing in the string tells them apart.
--    Rewriting would turn this shop's local landlines into valid-looking
--    numbers belonging to strangers. `phoneLookupCandidates()` tries the
--    mobile reading at lookup time instead, where a bad guess costs a miss
--    rather than a wrong number.
--
-- 2. A row is skipped if its canonical form is already held by another live
--    customer. The point of this change is to prevent duplicates, so it must
--    not manufacture one on the way in. Anything skipped keeps its original
--    value and can be merged by hand.

UPDATE customers AS c
   SET phone = '+91' || right(regexp_replace(c.phone, '\D', '', 'g'), 10),
       "updatedAt" = now()
 WHERE c."deletedAt" IS NULL
   AND regexp_replace(c.phone, '\D', '', 'g') ~ '^(91)?[6-9][0-9]{9}$'
   AND c.phone <> '+91' || right(regexp_replace(c.phone, '\D', '', 'g'), 10)
   AND NOT EXISTS (
     SELECT 1
       FROM customers AS other
      WHERE other.id <> c.id
        AND other."deletedAt" IS NULL
        AND other.phone = '+91' || right(regexp_replace(c.phone, '\D', '', 'g'), 10)
   );

-- NOTE — a gap this migration deliberately does NOT close.
--
-- `customers_phone_deletedAt_key` is UNIQUE(phone, "deletedAt"), and Postgres
-- treats NULLs as distinct, so it does not stop two ACTIVE customers sharing a
-- number: for every live row `deletedAt` is NULL. Verified against this
-- database — a second row with an existing phone inserts happily.
--
-- Uniqueness is therefore enforced in `customers.service.ts`, by an
-- INSERT ... WHERE NOT EXISTS that is atomic in the same way the stock and
-- billing guards are: the WHERE clause is the boundary, not a read taken
-- beforehand.
--
-- The database-level fix needs PG 15+ (this is 16.2):
--
--   DROP INDEX "customers_phone_deletedAt_key";
--   CREATE UNIQUE INDEX "customers_phone_deletedAt_key"
--     ON customers (phone, "deletedAt") NULLS NOT DISTINCT;
--
-- It is left out because Prisma 5 cannot express NULLS NOT DISTINCT, so the
-- next `prisma migrate dev` would generate a migration dropping it again.
-- Apply it by hand if you would rather have the constraint than the clean
-- diff — the service guard stays correct either way.
