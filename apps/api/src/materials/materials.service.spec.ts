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
