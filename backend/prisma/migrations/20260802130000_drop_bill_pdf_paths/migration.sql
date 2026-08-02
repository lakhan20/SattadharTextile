-- Invoices are now rendered on demand and streamed to the client, never stored
-- on disk, so the bill no longer carries a path to a generated file.
ALTER TABLE "bills" DROP COLUMN IF EXISTS "pdfPathEn";
ALTER TABLE "bills" DROP COLUMN IF EXISTS "pdfPathGu";
