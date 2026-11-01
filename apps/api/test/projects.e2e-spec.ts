import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProjectsService } from '../src/projects/projects.service';

describe('Projects API (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const service = {
      create: async (body: unknown) => ({ id: 'project-1', ...(body as object), status: 'WISHLIST' }),
      list: async () => [],
      board: async () => ({ WISHLIST: [], IN_PROGRESS: [], COMPLETED: [] }),
      updateStatus: async (id: string, status: string) => ({ id, status, completedAt: status === 'COMPLETED' ? new Date().toISOString() : null }),
      remove: async (id: string) => { if (id === 'missing') throw new Error('PROJECT_NOT_FOUND'); },
      createAllocation: async () => { const error = Object.assign(new Error('库存不足，无法完成扣减。'), { code: 'INSUFFICIENT_STOCK' }); throw error; },
      updateAllocation: async () => ({}), removeAllocation: async () => undefined,
      createFinishedGood: async (id: string) => { if (id === 'incomplete') throw new Error('PROJECT_NOT_COMPLETED'); return { sourceProjectId: id, allocations: [{ materialId: 'leather-1', quantity: '0.35' }] }; },
    };
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ProjectsService).useValue(service).compile();
    app = module.createNestApplication(); await app.init();
  });
  afterEach(async () => app.close());

  it('creates a project and returns exact board status groups', async () => {
    await request(app.getHttpServer()).post('/api/v1/projects').send({ name: '托特包', type: '包袋', primaryColor: '棕色' }).expect(201).expect(({ body }) => expect(body).toMatchObject({ status: 'WISHLIST' }));
    await request(app.getHttpServer()).get('/api/v1/projects/board').expect(200).expect(({ body }) => expect(body).toEqual({ WISHLIST: [], IN_PROGRESS: [], COMPLETED: [] }));
  });

  it('maps status and inventory errors to stable Chinese API contracts', async () => {
    await request(app.getHttpServer()).patch('/api/v1/projects/project-1/status').send({ status: 'COMPLETED' }).expect(200).expect(({ body }) => expect(body).toMatchObject({ status: 'COMPLETED', completedAt: expect.any(String) }));
    await request(app.getHttpServer()).post('/api/v1/projects/project-1/allocations').send({ materialId: 'leather-1', quantity: '9.00' }).expect(409).expect(({ body }) => expect(body).toMatchObject({ code: 'INSUFFICIENT_STOCK' }));
    await request(app.getHttpServer()).post('/api/v1/projects/incomplete/finished-good').expect(409).expect(({ body }) => expect(body).toMatchObject({ code: 'PROJECT_NOT_COMPLETED', message: expect.any(String) }));
    await request(app.getHttpServer()).delete('/api/v1/projects/missing').expect(404).expect(({ body }) => expect(body).toMatchObject({ code: 'PROJECT_NOT_FOUND', message: expect.any(String) }));
  });
});

describe.skip('Projects allocation concurrency (Docker PostgreSQL required)', () => {
  it('atomically rejects competing allocations that exceed the same material balance', async () => {});
});
