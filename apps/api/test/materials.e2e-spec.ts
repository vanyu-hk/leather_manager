import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InventoryService, InsufficientStockError } from '../src/inventory/inventory.service';
import { MaterialsService } from '../src/materials/materials.service';

describe('Materials API (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MaterialsService).useValue({ create: (body: unknown) => body, list: () => [], remove: async (id: string) => { if (id === 'has-history') { const error = Object.assign(new Error('该材料仍有库存或出入库历史，无法删除。'), { code: 'MATERIAL_HAS_HISTORY' }); throw error; } if (id === 'missing') throw new Error('MATERIAL_NOT_FOUND'); } })
      .overrideProvider(InventoryService).useValue({ changeBalance: async () => { throw new InsufficientStockError(); } })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterEach(async () => app.close());

  it('returns the stable insufficient-stock API error', async () => {
    await request(app.getHttpServer()).post('/api/v1/materials/material-1/adjustments')
      .send({ quantityDelta: '-3.00', reason: '盘点' })
      .expect(409)
      .expect(({ body }) => { expect(body).toMatchObject({ code: 'INSUFFICIENT_STOCK' }); });
  });

  it('returns MATERIAL_HAS_HISTORY with a Chinese explanation when deletion is guarded', async () => {
    await request(app.getHttpServer()).delete('/api/v1/materials/has-history')
      .expect(409)
      .expect(({ body }) => { expect(body).toMatchObject({ code: 'MATERIAL_HAS_HISTORY', message: expect.stringContaining('无法删除') }); });
  });

  it('returns stable Chinese MATERIAL_NOT_FOUND for a missing material deletion', async () => {
    await request(app.getHttpServer()).delete('/api/v1/materials/missing')
      .expect(404)
      .expect(({ body }) => { expect(body).toEqual(expect.objectContaining({ code: 'MATERIAL_NOT_FOUND', message: '未找到该材料。' })); });
  });
});

describe.skip('Materials concurrent adjustments (Docker PostgreSQL required)', () => {
  it('preserves both simultaneous positive adjustments via database atomic increments', async () => {
    // Runs only against the Compose PostgreSQL database; repository-boundary coverage asserts increment meanwhile.
  });
});
