import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProjectsService } from '../src/projects/projects.service';
import { InventoryService } from '../src/inventory/inventory.service';

describe('Projects API (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const service = {
      create: async (body: unknown) => ({ id: 'project-1', ...(body as object), status: 'WISHLIST' }),
      list: async () => [],
      board: async () => ({ WISHLIST: [], IN_PROGRESS: [], COMPLETED: [] }),
      updateStatus: async (id: string, status: string) => ({ id, status, completedAt: status === 'COMPLETED' ? new Date().toISOString() : null }),
      remove: async (id: string) => { if (id === 'missing') throw new Error('PROJECT_NOT_FOUND'); },
      createAllocation: async (id: string, body: { materialId: string }) => { if (body.materialId === 'missing-material' || body.materialId === 'raced-material') throw new Error('MATERIAL_NOT_FOUND'); const error = Object.assign(new Error('库存不足，无法完成扣减。'), { code: 'INSUFFICIENT_STOCK' }); throw error; },
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
    await request(app.getHttpServer()).post('/api/v1/projects/project-1/allocations').send({ materialId: 'missing-material', quantity: '0.35' }).expect(404).expect(({ body }) => expect(body).toEqual(expect.objectContaining({ code: 'MATERIAL_NOT_FOUND', message: '未找到该材料。' })));
    await request(app.getHttpServer()).post('/api/v1/projects/project-1/allocations').send({ materialId: 'raced-material', quantity: '0.35' }).expect(404).expect(({ body }) => expect(body).toEqual(expect.objectContaining({ code: 'MATERIAL_NOT_FOUND', message: '未找到该材料。' })));
    await request(app.getHttpServer()).post('/api/v1/projects/incomplete/finished-good').expect(409).expect(({ body }) => expect(body).toMatchObject({ code: 'PROJECT_NOT_COMPLETED', message: expect.any(String) }));
    await request(app.getHttpServer()).delete('/api/v1/projects/missing').expect(404).expect(({ body }) => expect(body).toMatchObject({ code: 'PROJECT_NOT_FOUND', message: expect.any(String) }));
  });
});

const describePostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describePostgres('Projects allocation concurrency (Docker PostgreSQL required)', () => {
  it('atomically rejects one of two competing allocations that exceed the material balance', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const client = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL! } } });
    const projects = new ProjectsService(client as never, new InventoryService(client as never));
    let materialId: string | undefined; let projectId: string | undefined;
    try {
      const material = await client.material.create({ data: { name: '并发测试皮料', type: '植鞣革', color: '棕色', unit: '平方英尺', currentQuantity: '0.60' } }); materialId = material.id;
      const project = await projects.create({ name: '并发项目', type: '包袋', primaryColor: '棕色' }); projectId = project.id as string;
      const attempts = await Promise.allSettled([
        projects.createAllocation(projectId, { materialId, quantity: '0.35' }),
        projects.createAllocation(projectId, { materialId, quantity: '0.35' }),
      ]);
      expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
      expect(attempts.find((attempt) => attempt.status === 'rejected')).toMatchObject({ reason: expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }) });
      expect(String((await client.material.findUniqueOrThrow({ where: { id: materialId } })).currentQuantity)).toBe('0.25');
      expect(await client.materialAllocation.count({ where: { projectId } })).toBe(1);
      expect(await client.inventoryMovement.count({ where: { materialId, reason: 'ALLOCATION' } })).toBe(1);
    } finally {
      if (projectId) await client.project.delete({ where: { id: projectId } }).catch(() => undefined);
      if (materialId) await client.material.delete({ where: { id: materialId } }).catch(() => undefined);
      await client.$disconnect();
    }
  });
});
