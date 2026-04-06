-- DropForeignKey
ALTER TABLE "elections" DROP CONSTRAINT "elections_group_id_fkey";

-- AlterTable
ALTER TABLE "election_groups" ADD COLUMN "onchain_series_id" TEXT;

-- AlterTable
ALTER TABLE "elections" ALTER COLUMN "group_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "election_groups_onchain_series_id_key" ON "election_groups"("onchain_series_id");

-- AddForeignKey
ALTER TABLE "elections" ADD CONSTRAINT "elections_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "election_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
