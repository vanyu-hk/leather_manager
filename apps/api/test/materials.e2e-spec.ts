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
      .overrideProvider(MaterialsService).useValue({ create: (body: unknown) => body, list: () => [], remove: async () => undefined })
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
});
