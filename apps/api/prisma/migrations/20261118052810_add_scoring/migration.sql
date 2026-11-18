-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "judgeModelConfigId" TEXT,
ADD COLUMN     "scorer" TEXT NOT NULL DEFAULT 'none';

-- AlterTable
ALTER TABLE "RunResult" ADD COLUMN     "judgeCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "judgeReason" TEXT,
ADD COLUMN     "score" DOUBLE PRECISION,
ADD COLUMN     "scoreError" TEXT;
