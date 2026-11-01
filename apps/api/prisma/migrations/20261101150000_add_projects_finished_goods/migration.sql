CREATE TYPE "ProjectStatus" AS ENUM ('WISHLIST', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "primaryColor" TEXT NOT NULL,
  "status" "ProjectStatus" NOT NULL DEFAULT 'WISHLIST',
  "description" TEXT,
  "reference" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MaterialAllocation" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaterialAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaterialAllocation_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "FinishedGood" (
  "id" TEXT NOT NULL,
  "sourceProjectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "primaryColor" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinishedGood_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinishedGood_sourceProjectId_key" UNIQUE ("sourceProjectId"),
  CONSTRAINT "FinishedGood_sourceProjectId_fkey" FOREIGN KEY ("sourceProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
