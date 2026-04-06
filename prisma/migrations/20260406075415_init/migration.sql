-- CreateEnum
CREATE TYPE "VerifiedOrganizerStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PrivateElectionState" AS ENUM ('PREPARED', 'ONCHAIN_PENDING', 'ACTIVE', 'FINALIZED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "VisibilityMode" AS ENUM ('OPEN', 'PRIVATE');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('FREE', 'PAID');

-- CreateEnum
CREATE TYPE "BallotPolicy" AS ENUM ('ONE_PER_ELECTION', 'ONE_PER_INTERVAL', 'UNLIMITED_PAID');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verified_organizers" (
    "id" BIGSERIAL NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "status" "VerifiedOrganizerStatus" NOT NULL,
    "rejection_reason" TEXT,
    "verified_by" BIGINT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verified_organizers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "election_groups" (
    "id" BIGSERIAL NOT NULL,
    "group_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "election_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elections" (
    "id" BIGSERIAL NOT NULL,
    "group_id" BIGINT,
    "onchain_election_id" TEXT,
    "onchain_election_address" TEXT,
    "title" TEXT NOT NULL,
    "candidate_manifest_preimage" JSONB NOT NULL,
    "organizer_wallet_address" TEXT NOT NULL,
    "organizer_verified_snapshot" BOOLEAN NOT NULL DEFAULT false,
    "visibility_mode" "VisibilityMode" NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL,
    "ballot_policy" "BallotPolicy" NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "result_reveal_at" TIMESTAMP(3) NOT NULL,
    "min_karma_tier" INTEGER NOT NULL,
    "reset_interval_seconds" INTEGER NOT NULL,
    "allow_multiple_choice" BOOLEAN NOT NULL,
    "max_selections_per_submission" INTEGER NOT NULL,
    "timezone_window_offset" INTEGER NOT NULL,
    "payment_token" TEXT,
    "cost_per_ballot" TEXT NOT NULL,
    "state" "PrivateElectionState" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "election_keys" (
    "id" BIGSERIAL NOT NULL,
    "election_id" BIGINT,
    "public_key" TEXT NOT NULL,
    "private_key_commitment_hash" TEXT NOT NULL,
    "private_key_encrypted" TEXT NOT NULL,
    "is_revealed" BOOLEAN NOT NULL DEFAULT false,
    "revealed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "election_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "election_candidates" (
    "id" BIGSERIAL NOT NULL,
    "election_id" BIGINT NOT NULL,
    "candidate_key" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "election_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_submissions" (
    "id" BIGSERIAL NOT NULL,
    "election_id" BIGINT NOT NULL,
    "onchain_tx_hash" TEXT NOT NULL,
    "voter_address" TEXT NOT NULL,
    "block_number" INTEGER NOT NULL,
    "block_timestamp" TIMESTAMP(3) NOT NULL,
    "encrypted_ballot" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vote_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decrypted_ballots" (
    "id" BIGSERIAL NOT NULL,
    "vote_submission_id" BIGINT NOT NULL,
    "candidate_keys" JSONB NOT NULL,
    "nonce" TEXT NOT NULL,
    "is_valid" BOOLEAN NOT NULL,
    "validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decrypted_ballots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invalid_ballots" (
    "id" BIGSERIAL NOT NULL,
    "vote_submission_id" BIGINT NOT NULL,
    "reason_code" TEXT NOT NULL,
    "reason_detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invalid_ballots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_tally" (
    "id" BIGSERIAL NOT NULL,
    "election_id" BIGINT NOT NULL,
    "candidate_key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_tally_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finalized_tally" (
    "id" BIGSERIAL NOT NULL,
    "election_id" BIGINT NOT NULL,
    "candidate_key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "vote_ratio" DOUBLE PRECISION NOT NULL,
    "finalized_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finalized_tally_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_summaries" (
    "id" BIGSERIAL NOT NULL,
    "election_id" BIGINT NOT NULL,
    "total_submissions" INTEGER NOT NULL,
    "total_decrypted_ballots" INTEGER NOT NULL,
    "total_valid_votes" INTEGER NOT NULL,
    "total_invalid_votes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "verified_organizers_wallet_address_key" ON "verified_organizers"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "election_groups_group_key_key" ON "election_groups"("group_key");

-- CreateIndex
CREATE UNIQUE INDEX "elections_onchain_election_id_key" ON "elections"("onchain_election_id");

-- CreateIndex
CREATE UNIQUE INDEX "elections_onchain_election_address_key" ON "elections"("onchain_election_address");

-- CreateIndex
CREATE INDEX "elections_group_id_idx" ON "elections"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "election_keys_election_id_key" ON "election_keys"("election_id");

-- CreateIndex
CREATE UNIQUE INDEX "election_keys_private_key_commitment_hash_key" ON "election_keys"("private_key_commitment_hash");

-- CreateIndex
CREATE INDEX "election_candidates_election_id_display_order_idx" ON "election_candidates"("election_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "election_candidates_election_id_candidate_key_key" ON "election_candidates"("election_id", "candidate_key");

-- CreateIndex
CREATE UNIQUE INDEX "vote_submissions_onchain_tx_hash_key" ON "vote_submissions"("onchain_tx_hash");

-- CreateIndex
CREATE INDEX "vote_submissions_election_id_block_number_idx" ON "vote_submissions"("election_id", "block_number");

-- CreateIndex
CREATE INDEX "vote_submissions_voter_address_idx" ON "vote_submissions"("voter_address");

-- CreateIndex
CREATE UNIQUE INDEX "decrypted_ballots_vote_submission_id_key" ON "decrypted_ballots"("vote_submission_id");

-- CreateIndex
CREATE INDEX "decrypted_ballots_is_valid_idx" ON "decrypted_ballots"("is_valid");

-- CreateIndex
CREATE INDEX "invalid_ballots_vote_submission_id_idx" ON "invalid_ballots"("vote_submission_id");

-- CreateIndex
CREATE INDEX "invalid_ballots_reason_code_idx" ON "invalid_ballots"("reason_code");

-- CreateIndex
CREATE UNIQUE INDEX "live_tally_election_id_candidate_key_key" ON "live_tally"("election_id", "candidate_key");

-- CreateIndex
CREATE UNIQUE INDEX "finalized_tally_election_id_candidate_key_key" ON "finalized_tally"("election_id", "candidate_key");

-- CreateIndex
CREATE UNIQUE INDEX "result_summaries_election_id_key" ON "result_summaries"("election_id");

-- AddForeignKey
ALTER TABLE "verified_organizers" ADD CONSTRAINT "verified_organizers_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elections" ADD CONSTRAINT "elections_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "election_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election_keys" ADD CONSTRAINT "election_keys_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election_candidates" ADD CONSTRAINT "election_candidates_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_submissions" ADD CONSTRAINT "vote_submissions_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decrypted_ballots" ADD CONSTRAINT "decrypted_ballots_vote_submission_id_fkey" FOREIGN KEY ("vote_submission_id") REFERENCES "vote_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invalid_ballots" ADD CONSTRAINT "invalid_ballots_vote_submission_id_fkey" FOREIGN KEY ("vote_submission_id") REFERENCES "vote_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_tally" ADD CONSTRAINT "live_tally_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finalized_tally" ADD CONSTRAINT "finalized_tally_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_summaries" ADD CONSTRAINT "result_summaries_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
