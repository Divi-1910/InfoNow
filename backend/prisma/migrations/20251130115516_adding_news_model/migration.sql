-- CreateEnum
CREATE TYPE "DataType" AS ENUM ('News', 'Reddit', 'Youtube', 'Wikipedia');

-- CreateTable
CREATE TABLE "DataPoint" (
    "id" TEXT NOT NULL,
    "type" "DataType" NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawNewsArticle" (
    "id" TEXT NOT NULL,
    "dataId" TEXT NOT NULL,
    "sourceName" TEXT,
    "author" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "urlToImage" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT,

    CONSTRAINT "RawNewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrichedNewsArticle" (
    "id" TEXT NOT NULL,
    "dataId" TEXT NOT NULL,
    "rawContent" TEXT,
    "enrichedContent" TEXT,
    "summary" TEXT,

    CONSTRAINT "EnrichedNewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RawNewsArticle_dataId_key" ON "RawNewsArticle"("dataId");

-- CreateIndex
CREATE UNIQUE INDEX "RawNewsArticle_url_key" ON "RawNewsArticle"("url");

-- CreateIndex
CREATE UNIQUE INDEX "EnrichedNewsArticle_dataId_key" ON "EnrichedNewsArticle"("dataId");

-- AddForeignKey
ALTER TABLE "RawNewsArticle" ADD CONSTRAINT "RawNewsArticle_dataId_fkey" FOREIGN KEY ("dataId") REFERENCES "DataPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichedNewsArticle" ADD CONSTRAINT "EnrichedNewsArticle_dataId_fkey" FOREIGN KEY ("dataId") REFERENCES "DataPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
