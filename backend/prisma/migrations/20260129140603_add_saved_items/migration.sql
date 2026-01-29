-- CreateTable
CREATE TABLE "SavedItem" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "dataPointId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedItem_userId_savedAt_idx" ON "SavedItem"("userId", "savedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedItem_userId_dataPointId_key" ON "SavedItem"("userId", "dataPointId");

-- AddForeignKey
ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_dataPointId_fkey" FOREIGN KEY ("dataPointId") REFERENCES "DataPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
