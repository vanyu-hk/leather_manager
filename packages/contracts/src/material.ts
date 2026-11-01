export type StockStatus = 'NORMAL' | 'LOW' | 'OUT_OF_STOCK';
export type MovementReason = 'OPENING_BALANCE' | 'ADJUSTMENT' | 'PURCHASE' | 'ALLOCATION' | 'RETURN';
export interface Material { id: string; name: string; type: string; color: string; unit: string; currentQuantity: string; lowStockThreshold: string | null; }
export interface InventoryMovement { id: string; materialId: string; quantityDelta: string; reason: MovementReason; occurredAt: string; }
