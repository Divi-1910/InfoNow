/*
  Warnings:

  - You are about to drop the column `hash` on the `DataPoint` table. All the data in the column will be lost.
  - You are about to drop the column `enrichedContent` on the `EnrichedNewsArticle` table. All the data in the column will be lost.
  - You are about to drop the column `rawContent` on the `EnrichedNewsArticle` table. All the data in the column will be lost.
  - You are about to drop the column `content` on the `RawNewsArticle` table. All the data in the column will be lost.
  - You are about to drop the column `urlToImage` on the `RawNewsArticle` table. All the data in the column will be lost.
  - Added the required column `contentHash` to the `DataPoint` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fetchedAt` to the `DataPoint` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fullContent` to the `EnrichedNewsArticle` table without a default value. This is not possible if the table is not empty.
  - Added the required column `scrapedAt` to the `EnrichedNewsArticle` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DataPoint" DROP COLUMN "hash",
ADD COLUMN     "contentHash" TEXT NOT NULL,
ADD COLUMN     "fetchedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "subTopicId" INTEGER,
ADD COLUMN     "topicId" INTEGER;

-- AlterTable
ALTER TABLE "EnrichedNewsArticle" DROP COLUMN "enrichedContent",
DROP COLUMN "rawContent",
ADD COLUMN     "fullContent" TEXT NOT NULL,
ADD COLUMN     "scrapedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "RawNewsArticle" DROP COLUMN "content",
DROP COLUMN "urlToImage",
ADD COLUMN     "imageUrl" TEXT;

-- CreateTable
CREATE TABLE "RawRedditPost" (
    "id" TEXT NOT NULL,
    "dataId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "subreddit" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "selftext" TEXT,
    "author" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "numComments" INTEGER NOT NULL,
    "permalink" TEXT NOT NULL,
    "createdUtc" TIMESTAMP(3) NOT NULL,
    "isVideo" BOOLEAN NOT NULL DEFAULT false,
    "thumbnail" TEXT,

    CONSTRAINT "RawRedditPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawYoutubeVideo" (
    "id" TEXT NOT NULL,
    "dataId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelTitle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "duration" TEXT,
    "viewCount" BIGINT NOT NULL DEFAULT 0,
    "likeCount" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "RawYoutubeVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsChunk" (
    "id" TEXT NOT NULL,
    "enrichedArticleId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "tokenCount" INTEGER NOT NULL,

    CONSTRAINT "NewsChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawApiResponse" (
    "id" TEXT NOT NULL,
    "sourceType" "DataType" NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawApiResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RawRedditPost_dataId_key" ON "RawRedditPost"("dataId");

-- CreateIndex
CREATE UNIQUE INDEX "RawRedditPost_postId_key" ON "RawRedditPost"("postId");

-- CreateIndex
CREATE INDEX "RawRedditPost_subreddit_idx" ON "RawRedditPost"("subreddit");

-- CreateIndex
CREATE INDEX "RawRedditPost_createdUtc_idx" ON "RawRedditPost"("createdUtc");

-- CreateIndex
CREATE INDEX "RawRedditPost_score_idx" ON "RawRedditPost"("score");

-- CreateIndex
CREATE UNIQUE INDEX "RawYoutubeVideo_dataId_key" ON "RawYoutubeVideo"("dataId");

-- CreateIndex
CREATE UNIQUE INDEX "RawYoutubeVideo_videoId_key" ON "RawYoutubeVideo"("videoId");

-- CreateIndex
CREATE INDEX "RawYoutubeVideo_channelId_idx" ON "RawYoutubeVideo"("channelId");

-- CreateIndex
CREATE INDEX "RawYoutubeVideo_publishedAt_idx" ON "RawYoutubeVideo"("publishedAt");

-- CreateIndex
CREATE INDEX "RawYoutubeVideo_viewCount_idx" ON "RawYoutubeVideo"("viewCount");

-- CreateIndex
CREATE INDEX "NewsChunk_enrichedArticleId_idx" ON "NewsChunk"("enrichedArticleId");

-- CreateIndex
CREATE INDEX "RawApiResponse_sourceType_idx" ON "RawApiResponse"("sourceType");

-- CreateIndex
CREATE INDEX "RawApiResponse_receivedAt_idx" ON "RawApiResponse"("receivedAt");

-- CreateIndex
CREATE INDEX "DataPoint_topicId_idx" ON "DataPoint"("topicId");

-- CreateIndex
CREATE INDEX "DataPoint_subTopicId_idx" ON "DataPoint"("subTopicId");

-- CreateIndex
CREATE INDEX "DataPoint_type_idx" ON "DataPoint"("type");

-- CreateIndex
CREATE INDEX "DataPoint_fetchedAt_idx" ON "DataPoint"("fetchedAt");

-- CreateIndex
CREATE INDEX "EnrichedNewsArticle_scrapedAt_idx" ON "EnrichedNewsArticle"("scrapedAt");

-- CreateIndex
CREATE INDEX "RawNewsArticle_publishedAt_idx" ON "RawNewsArticle"("publishedAt");

-- AddForeignKey
ALTER TABLE "DataPoint" ADD CONSTRAINT "DataPoint_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataPoint" ADD CONSTRAINT "DataPoint_subTopicId_fkey" FOREIGN KEY ("subTopicId") REFERENCES "SubTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawRedditPost" ADD CONSTRAINT "RawRedditPost_dataId_fkey" FOREIGN KEY ("dataId") REFERENCES "DataPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawYoutubeVideo" ADD CONSTRAINT "RawYoutubeVideo_dataId_fkey" FOREIGN KEY ("dataId") REFERENCES "DataPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsChunk" ADD CONSTRAINT "NewsChunk_enrichedArticleId_fkey" FOREIGN KEY ("enrichedArticleId") REFERENCES "EnrichedNewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
