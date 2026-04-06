CREATE TABLE "indexer_cursors" (
    "key" TEXT NOT NULL,
    "block_number" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "indexer_cursors_pkey" PRIMARY KEY ("key")
);
