import { describe, expect, it } from 'vitest';
import { InventoryService } from './inventory.service.js';

describe('InventoryService', () => {
  it('rejects a decrease that would make inventory negative', async () => {
    const service = new InventoryService(new BalanceDatabase('2.00') as never);

    await expect(
      service.changeBalance('material-1', {
        quantityDelta: '-3.00',
        reason: '盘点',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
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
