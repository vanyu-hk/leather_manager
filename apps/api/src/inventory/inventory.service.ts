export class InsufficientStockError extends Error {
  readonly code = 'INSUFFICIENT_STOCK';

  constructor() {
    super('库存不足，无法完成扣减。');
  }
}

type ChangeBalanceInput = { quantityDelta: string; reason: string };

type Database = {
  $transaction<T>(callback: (tx: Database) => Promise<T>): Promise<T>;
  material: {
    findUnique(args: { where: { id: string } }): Promise<
      | { id: string; currentQuantity: unknown }
      | null
    >;
    update?: (args: { where: { id: string }; data: { currentQuantity: string } }) => Promise<unknown>;
  };
  inventoryMovement?: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
};

export class InventoryService {
  constructor(private readonly db: Database) {}

  async changeBalance(materialId: string, input: ChangeBalanceInput): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const material = await tx.material.findUnique({ where: { id: materialId } });
      if (!material) throw new Error('MATERIAL_NOT_FOUND');

      const next = fromDecimal(material.currentQuantity) + fromDecimal(input.quantityDelta);
      if (next < 0n) throw new InsufficientStockError();

      const currentQuantity = toDecimal(next);
      await tx.material.update?.({ where: { id: materialId }, data: { currentQuantity } });
      await tx.inventoryMovement?.create({
        data: {
          materialId,
          quantityDelta: toDecimal(fromDecimal(input.quantityDelta)),
          reason: input.reason,
          occurredAt: new Date(),
        },
      });
    });
  }
}

function fromDecimal(value: unknown): bigint {
  const normalized = String(value).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error('INVALID_QUANTITY');
  }
  const negative = normalized.startsWith('-');
  const [whole, fraction = ''] = (negative ? normalized.slice(1) : normalized).split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -cents : cents;
}

function toDecimal(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
