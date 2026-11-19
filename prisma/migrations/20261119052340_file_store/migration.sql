-- CreateTable
CREATE TABLE "purchase_files" (
    "path" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_files_pkey" PRIMARY KEY ("path")
);
