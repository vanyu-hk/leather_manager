CREATE TYPE "MovementReason" AS ENUM ('OPENING_BALANCE', 'ADJUSTMENT', 'PURCHASE', 'ALLOCATION', 'RETURN');

CREATE TABLE "Material" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "currentQuantity" DECIMAL(12,2) NOT NULL,
  "lowStockThreshold" DECIMAL(12,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "quantityDelta" DECIMAL(12,2) NOT NULL,
  "reason" "MovementReason" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
