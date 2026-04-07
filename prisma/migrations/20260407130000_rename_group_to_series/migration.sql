ALTER TABLE "election_groups" RENAME TO "election_series";

ALTER TABLE "election_series" RENAME COLUMN "group_key" TO "series_key";
ALTER TABLE "elections" RENAME COLUMN "group_id" TO "series_id";

ALTER INDEX "election_groups_pkey" RENAME TO "election_series_pkey";
ALTER INDEX "election_groups_group_key_key" RENAME TO "election_series_series_key_key";
ALTER INDEX "election_groups_onchain_series_id_key" RENAME TO "election_series_onchain_series_id_key";
ALTER INDEX "elections_group_id_idx" RENAME TO "elections_series_id_idx";

ALTER TABLE "elections" RENAME CONSTRAINT "elections_group_id_fkey" TO "elections_series_id_fkey";
