export class CreateMaterialDto { name!: string; type!: string; color!: string; unit!: string; initialQuantity?: string; lowStockThreshold?: string; }
export class AdjustMaterialDto { quantityDelta!: string; }
export class ListMaterialsDto { q?: string; type?: string; color?: string; stockStatus?: 'NORMAL' | 'LOW' | 'OUT_OF_STOCK'; }
