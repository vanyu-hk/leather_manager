import { describe, expect, it } from 'vitest';
import { InventoryService } from './inventory.service.js';

describe('InventoryService', () => {
  it('rejects a decrease that would make inventory negative', async () => {
    const service = new InventoryService(new BalanceDatabase('2.00') as never);

    await expect(
      service.changeBalance('material-1', {
        quantityDelta: '-3.00',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });

  it('normalizes a successful adjustment and persists one ADJUSTMENT movement', async () => {
    const db = new WritableBalanceDatabase('1.00');
    await new InventoryService(db as never).changeBalance('material-1', { quantityDelta: '1' });
    expect(db.currentQuantity).toBe('2.00');
    expect(db.movements).toEqual([expect.objectContaining({ reason: 'ADJUSTMENT', quantityDelta: '1.00' })]);
  });

  it('uses atomic increment for a positive adjustment before writing movement history', async () => {
    const db = new IncrementDatabase();
    await new InventoryService(db as never).changeBalance('material-1', { quantityDelta: '1.00' });
    expect(db.updateArgs).toMatchObject({ where: { id: 'material-1' }, data: { currentQuantity: { increment: '1.00' } } });
    expect(db.movements).toHaveLength(1);
  });

  it('uses conditional updateMany for a decrement and does not write history when it loses the race', async () => {
    const db = new ConditionalFailureDatabase();
    await expect(new InventoryService(db as never).changeBalance('material-1', { quantityDelta: '-1.00' })).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(db.updateManyArgs).toMatchObject({ where: { id: 'material-1', currentQuantity: { gte: '1.00' } } });
    expect(db.movements).toHaveLength(0);
  });
});

class BalanceDatabase {
  constructor(private readonly quantity: string) {}

  material = {
    findUnique: async () => ({ id: 'material-1', currentQuantity: this.quantity }),
  };

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

class WritableBalanceDatabase {
  currentQuantity: string; movements: Array<Record<string, unknown>> = [];
  constructor(quantity: string) { this.currentQuantity = quantity; }
  material = { findUnique: async () => ({ id: 'material-1', currentQuantity: this.currentQuantity }), update: async ({ data }: { data: { currentQuantity: string | { increment: string } } }) => { this.currentQuantity = typeof data.currentQuantity === 'string' ? data.currentQuantity : '2.00'; } };
  inventoryMovement = { create: async ({ data }: { data: Record<string, unknown> }) => { this.movements.push(data); } };
  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> { return callback(this); }
}

class ConditionalFailureDatabase {
  updateManyArgs: Record<string, unknown> | undefined; movements: Array<Record<string, unknown>> = [];
  material = {
    findUnique: async () => ({ id: 'material-1', currentQuantity: '1.00' }),
    updateMany: async (args: Record<string, unknown>) => { this.updateManyArgs = args; return { count: 0 }; },
  };
  inventoryMovement = { create: async ({ data }: { data: Record<string, unknown> }) => { this.movements.push(data); } };
  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> { return callback(this); }
}

class IncrementDatabase {
  updateArgs: Record<string, unknown> | undefined; movements: Array<Record<string, unknown>> = [];
  material = { findUnique: async () => ({ id: 'material-1', currentQuantity: '1.00' }), update: async (args: Record<string, unknown>) => { this.updateArgs = args; } };
  inventoryMovement = { create: async ({ data }: { data: Record<string, unknown> }) => { this.movements.push(data); } };
  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> { return callback(this); }
}
