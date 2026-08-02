-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "code" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "description" TEXT;

-- Drop the temporary default now that existing rows (if any) are backfilled.
ALTER TABLE "categories" ALTER COLUMN "code" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "categories_code_deletedAt_key" ON "categories"("code", "deletedAt");
