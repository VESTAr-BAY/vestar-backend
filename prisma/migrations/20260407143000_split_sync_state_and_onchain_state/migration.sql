CREATE TYPE "ElectionSyncState_new" AS ENUM (
  'PREPARED',
  'INDEXED',
  'EXPIRED',
  'FAILED'
);

CREATE TYPE "OnchainElectionState" AS ENUM (
  'SCHEDULED',
  'ACTIVE',
  'CLOSED',
  'KEY_REVEAL_PENDING',
  'KEY_REVEALED',
  'FINALIZED',
  'CANCELLED'
);

ALTER TABLE "elections" RENAME COLUMN "state" TO "sync_state";
ALTER TABLE "elections" ADD COLUMN "onchain_state" "OnchainElectionState";

UPDATE "elections"
SET "onchain_state" = CASE
  WHEN "sync_state"::text = 'ACTIVE' THEN 'ACTIVE'::"OnchainElectionState"
  WHEN "sync_state"::text = 'FINALIZED' THEN 'FINALIZED'::"OnchainElectionState"
  WHEN "sync_state"::text = 'CANCELLED' THEN 'CANCELLED'::"OnchainElectionState"
  ELSE NULL
END;

ALTER TABLE "elections"
  ALTER COLUMN "sync_state" TYPE "ElectionSyncState_new"
  USING (
    CASE
      WHEN "sync_state"::text = 'PREPARED' THEN 'PREPARED'
      WHEN "sync_state"::text = 'ONCHAIN_PENDING' THEN 'INDEXED'
      WHEN "sync_state"::text = 'ACTIVE' THEN 'INDEXED'
      WHEN "sync_state"::text = 'FINALIZED' THEN 'INDEXED'
      WHEN "sync_state"::text = 'CANCELLED' THEN 'INDEXED'
      WHEN "sync_state"::text = 'EXPIRED' THEN 'EXPIRED'
      WHEN "sync_state"::text = 'FAILED' THEN 'FAILED'
      ELSE 'FAILED'
    END::"ElectionSyncState_new"
  );

DROP TYPE "PrivateElectionState";
ALTER TYPE "ElectionSyncState_new" RENAME TO "ElectionSyncState";
