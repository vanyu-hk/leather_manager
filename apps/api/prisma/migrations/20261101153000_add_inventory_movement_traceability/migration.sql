ALTER TABLE "InventoryMovement" ADD COLUMN "projectId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "allocationId" TEXT;
CREATE INDEX "InventoryMovement_projectId_idx" ON "InventoryMovement"("projectId");
CREATE INDEX "InventoryMovement_allocationId_idx" ON "InventoryMovement"("allocationId");
