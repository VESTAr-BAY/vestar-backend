ALTER TABLE "vote_submissions" RENAME TO "private_vote_submissions";

ALTER TABLE "private_vote_submissions"
ADD COLUMN "payment_amount" TEXT NOT NULL DEFAULT '0';

ALTER TABLE "private_vote_submissions"
ALTER COLUMN "payment_amount" DROP DEFAULT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'open_vote_submissions'
  ) THEN
    ALTER TABLE "open_vote_submissions"
    DROP COLUMN IF EXISTS "ballots_spent";
  END IF;
END $$;

ALTER INDEX "vote_submissions_onchain_tx_hash_key"
RENAME TO "private_vote_submissions_onchain_tx_hash_key";

ALTER INDEX "vote_submissions_election_id_block_number_idx"
RENAME TO "private_vote_submissions_election_id_block_number_idx";

ALTER INDEX "vote_submissions_voter_address_idx"
RENAME TO "private_vote_submissions_voter_address_idx";
