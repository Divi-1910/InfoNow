-- AlterEnum
ALTER TYPE "OutboxEventType" ADD VALUE IF NOT EXISTS 'YoutubeVideoEnriched';

-- CreateTable
CREATE TABLE "EnrichedYoutubeVideo" (
    "id" TEXT NOT NULL,
    "dataId" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "summary" TEXT,
    "transcribedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrichedYoutubeVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YoutubeTranscriptChunk" (
    "id" TEXT NOT NULL,
    "enrichedVideoId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "tokenCount" INTEGER NOT NULL,

    CONSTRAINT "YoutubeTranscriptChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnrichedYoutubeVideo_dataId_key" ON "EnrichedYoutubeVideo"("dataId");

-- CreateIndex
CREATE INDEX "EnrichedYoutubeVideo_transcribedAt_idx" ON "EnrichedYoutubeVideo"("transcribedAt");

-- CreateIndex
CREATE INDEX "YoutubeTranscriptChunk_enrichedVideoId_idx" ON "YoutubeTranscriptChunk"("enrichedVideoId");

-- AddForeignKey
ALTER TABLE "EnrichedYoutubeVideo" ADD CONSTRAINT "EnrichedYoutubeVideo_dataId_fkey" FOREIGN KEY ("dataId") REFERENCES "DataPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YoutubeTranscriptChunk" ADD CONSTRAINT "YoutubeTranscriptChunk_enrichedVideoId_fkey" FOREIGN KEY ("enrichedVideoId") REFERENCES "EnrichedYoutubeVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
