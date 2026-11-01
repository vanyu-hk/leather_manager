import { describe, expect, it } from 'vitest';
import { MaterialsService } from './materials.service.js';

describe('MaterialsService', () => {
  it('creates a material and records its opening balance', async () => {
    const db = new InMemoryDatabase();
    const service = new MaterialsService(db as never);

    const material = await service.create({
      name: '棕色植鞣革',
      type: '植鞣革',
      color: '棕色',
      unit: '平方尺',
      initialQuantity: '2.00',
    });

    expect(material.currentQuantity).toBe('2.00');
    expect(db.movementsForMaterial(material.id)).toContainEqual(
      expect.objectContaining({
        reason: 'OPENING_BALANCE',
        quantityDelta: '2.00',
      }),
    );
  });

  it('records one zero opening balance when quantity is omitted', async () => {
    const db = new InMemoryDatabase();
    const service = new MaterialsService(db as never);
    const material = await service.create({ name: '黑色牛皮', type: '牛皮', color: '黑色', unit: '平方尺' });
    expect(material.currentQuantity).toBe('0.00');
    expect(db.movementsForMaterial(material.id)).toHaveLength(1);
    expect(db.movementsForMaterial(material.id)[0]).toMatchObject({ reason: 'OPENING_BALANCE', quantityDelta: '0.00' });
  });

  it('filters materials by q, type, color, and stock status', async () => {
    const db = new QueryDatabase([
      { id: 'normal', name: '棕色植鞣革', type: '植鞣革', color: '棕色', unit: '尺', currentQuantity: '3.00', lowStockThreshold: '2.00' },
      { id: 'low', name: '黑色牛皮', type: '牛皮', color: '黑色', unit: '尺', currentQuantity: '2.00', lowStockThreshold: '2.00' },
      { id: 'zero', name: '白色牛皮', type: '牛皮', color: '白色', unit: '尺', currentQuantity: '0.00', lowStockThreshold: '2.00' },
    ]);
    const service = new MaterialsService(db as never);
    await expect(service.list({ q: '植鞣' })).resolves.toMatchObject([{ id: 'normal' }]);
    await expect(service.list({ type: '牛皮' })).resolves.toHaveLength(2);
    await expect(service.list({ color: '黑色' })).resolves.toMatchObject([{ id: 'low' }]);
    await expect(service.list({ stockStatus: 'NORMAL' })).resolves.toMatchObject([{ id: 'normal' }]);
    await expect(service.list({ stockStatus: 'LOW' })).resolves.toMatchObject([{ id: 'low' }]);
    await expect(service.list({ stockStatus: 'OUT_OF_STOCK' })).resolves.toMatchObject([{ id: 'zero' }]);
  });

  it('does not partially delete a material that has movement history', async () => {
    const db = new DeleteDatabase('1.00', 1);
    await expect(new MaterialsService(db as never).remove('material-1')).rejects.toMatchObject({ code: 'MATERIAL_HAS_HISTORY', message: expect.stringContaining('无法删除') });
    expect(db.deleted).toBe(false);
  });

  it('deletes a zero-quantity material with no history', async () => {
    const db = new DeleteDatabase('0.00', 0);
    await new MaterialsService(db as never).remove('material-1');
    expect(db.deleted).toBe(true);
  });
});

class InMemoryDatabase {
  private materials: Array<Record<string, unknown>> = [];
  private movements: Array<Record<string, unknown>> = [];

  material = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const material = { id: `material-${this.materials.length + 1}`, ...data };
      this.materials.push(material);
      return material;
    },
  };

  inventoryMovement = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const movement = { id: `movement-${this.movements.length + 1}`, ...data };
      this.movements.push(movement);
      return movement;
    },
  };

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return callback(this);
  }

  movementsForMaterial(materialId: string): Array<Record<string, unknown>> {
    return this.movements.filter((movement) => movement.materialId === materialId);
  }
}

class QueryDatabase {
  constructor(private readonly rows: Array<Record<string, unknown>>) {}
  material = { findMany: async ({ where }: { where: { type?: string; color?: string } }) => this.rows.filter((row) => (!where.type || row.type === where.type) && (!where.color || row.color === where.color)) };
}

class DeleteDatabase {
  deleted = false;
  constructor(private readonly quantity: string, private readonly history: number) {}
  material = {
    findUnique: async () => ({ id: 'material-1', currentQuantity: this.quantity, _count: { movements: this.history } }),
    delete: async () => { this.deleted = true; },
  };
  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> { return callback(this); }
}
