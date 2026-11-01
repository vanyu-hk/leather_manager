/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { ProjectsService } from './projects.service.js';

describe('ProjectsService', () => {
  it('creates projects and returns board groups for every exact status', async () => {
    const service = new ProjectsService(new ProjectsDatabase() as never, new RecordingInventory() as never);

    const created = await service.create({ name: '托特包', type: '包袋', primaryColor: '棕色' });
    const board = await service.board();

    expect(created).toMatchObject({ name: '托特包', status: 'WISHLIST' });
    expect(board).toEqual({ WISHLIST: [created], IN_PROGRESS: [], COMPLETED: [] });
  });

  it('allocates, adjusts only the quantity delta, then restores inventory on deletion', async () => {
    const db = new AllocationDatabase();
    const inventory = new RecordingInventory();
    const service = new ProjectsService(db as never, inventory as never);

    const allocation = await service.createAllocation('project-1', { materialId: 'material-1', quantity: '0.35' });
    await service.updateAllocation('project-1', allocation.id as string, { quantity: '0.50' });
    await service.removeAllocation('project-1', allocation.id as string);

    expect(inventory.changes).toEqual([
      expect.objectContaining({ materialId: 'material-1', quantityDelta: '-0.35', reason: 'ALLOCATION', projectId: 'project-1', allocationId: allocation.id }),
      expect.objectContaining({ materialId: 'material-1', quantityDelta: '-0.15', reason: 'ALLOCATION' }),
      expect.objectContaining({ materialId: 'material-1', quantityDelta: '0.50', reason: 'RETURN' }),
    ]);
    expect(db.allocations).toEqual([]);
  });

  it('restores every allocation exactly once when deleting a project', async () => {
    const db = new AllocationDatabase(); db.allocations.push({ id: 'allocation-1', projectId: 'project-1', materialId: 'material-1', quantity: '0.35' });
    const inventory = new RecordingInventory();
    await new ProjectsService(db as never, inventory as never).remove('project-1');
    expect(inventory.changes).toEqual([expect.objectContaining({ quantityDelta: '0.35', reason: 'RETURN' })]);
    expect(db.deleted).toBe('project-1');
  });

  it('sets completion timestamp and only creates finished goods from completed projects with source traceability', async () => {
    const db = new AllocationDatabase(); const service = new ProjectsService(db as never, new RecordingInventory() as never);
    db.allocations.push({ id: 'allocation-1', projectId: 'project-1', materialId: 'material-1', quantity: '0.35' });
    await expect(service.createFinishedGood('project-1')).rejects.toThrow('PROJECT_NOT_COMPLETED');
    const project = await service.updateStatus('project-1', 'COMPLETED');
    const good = await service.createFinishedGood('project-1');
    const existing = await service.createFinishedGood('project-1');
    expect(project.completedAt).toBeInstanceOf(Date);
    expect(good).toMatchObject({ sourceProjectId: 'project-1', name: '托特包', type: '包袋', primaryColor: '棕色', sourceProject: { id: 'project-1' }, allocations: [expect.objectContaining({ material: { id: 'material-1' } })] });
    expect(existing).toMatchObject({ sourceProject: { id: 'project-1' }, allocations: [expect.objectContaining({ materialId: 'material-1', quantity: '0.35' })] });
  });

  it('does not create an allocation when inventory rejects an over-allocation', async () => {
    const db = new AllocationDatabase();
    const inventory = new RecordingInventory(); inventory.reject = true;
    await expect(new ProjectsService(db as never, inventory as never).createAllocation('project-1', { materialId: 'material-1', quantity: '2.01' })).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(db.allocations).toEqual([]);
  });

  it('maps a material foreign-key race to MATERIAL_NOT_FOUND without retaining the allocation', async () => {
    const db = new AllocationDatabase();
    db.material = { findUnique: async () => ({ id: 'material-1' }) };
    db.materialAllocation.create = async () => { throw Object.assign(new Error('foreign key'), { code: 'P2003' }); };
    await expect(new ProjectsService(db as never, new RecordingInventory() as never).createAllocation('project-1', { materialId: 'material-1', quantity: '0.35' })).rejects.toThrow('MATERIAL_NOT_FOUND');
    expect(db.allocations).toEqual([]);
  });

  it('validates material existence before writing an allocation', async () => {
    const db = new AllocationDatabase();
    db.material = { findUnique: async () => null } as never;
    await expect(new ProjectsService(db as never, new RecordingInventory() as never).createAllocation('project-1', { materialId: 'missing-material', quantity: '0.35' })).rejects.toThrow('MATERIAL_NOT_FOUND');
    expect(db.allocations).toEqual([]);
  });

  it('rejects allocation mutation and deletion for completed archived projects', async () => {
    const db = new AllocationDatabase(); db.projectRecord.status = 'COMPLETED'; db.allocations.push({ id: 'allocation-1', projectId: 'project-1', materialId: 'material-1', quantity: '0.35' });
    const service = new ProjectsService(db as never, new RecordingInventory() as never);
    await expect(service.createAllocation('project-1', { materialId: 'material-1', quantity: '0.35' })).rejects.toThrow('PROJECT_ARCHIVED');
    await expect(service.updateAllocation('project-1', 'allocation-1', { quantity: '0.40' })).rejects.toThrow('PROJECT_ARCHIVED');
    await expect(service.removeAllocation('project-1', 'allocation-1')).rejects.toThrow('PROJECT_ARCHIVED');
    await expect(service.remove('project-1')).rejects.toThrow('PROJECT_ARCHIVED');
  });

  it('loads list finished goods with their source project and allocation material traceability', async () => {
    const db = new TraceListDatabase();
    await new ProjectsService(db as never, new RecordingInventory() as never).list();
    expect(db.findManyArgs).toMatchObject({ include: { allocations: { include: { material: true } }, finishedGood: { include: { sourceProject: { include: { allocations: { include: { material: true } } } } } } } });
  });
});

class ProjectsDatabase {
  projects: Array<Record<string, unknown>> = [];
  project = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const project = { id: `project-${this.projects.length + 1}`, ...data };
      this.projects.push(project);
      return project;
    },
    findMany: async () => this.projects,
  };
  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> { return callback(this); }
}

class RecordingInventory { changes: Array<Record<string, unknown>> = []; reject = false; async changeBalanceInTransaction(_tx: unknown, materialId: string, input: { quantityDelta: string }, reason: string, reference: { projectId?: string; allocationId?: string } = {}) { if (this.reject) throw Object.assign(new Error('库存不足'), { code: 'INSUFFICIENT_STOCK' }); this.changes.push({ materialId, ...input, reason, ...reference }); } }

class AllocationDatabase {
  allocations: Array<Record<string, any>> = []; deleted: string | undefined;
  projectRecord: Record<string, any> = { id: 'project-1', name: '托特包', type: '包袋', primaryColor: '棕色', status: 'WISHLIST', completedAt: null };
  project = {
    findUnique: async ({ where, include }: any) => where.id !== 'project-1' ? null : { ...this.projectRecord, ...(include?.allocations ? { allocations: this.allocations.map((a) => ({ ...a, material: { id: a.materialId } })) } : {}), ...(include?.finishedGood ? { finishedGood: this.finishedGoodRecord } : {}) },
    update: async ({ data }: any) => Object.assign(this.projectRecord, data),
    delete: async ({ where }: any) => { this.deleted = where.id; },
  };
  finishedGoodRecord: Record<string, unknown> | undefined;
  materialAllocation = {
    create: async ({ data }: any) => { const row = { id: `allocation-${this.allocations.length + 1}`, ...data }; this.allocations.push(row); return row; },
    findUnique: async ({ where }: any) => this.allocations.find((item) => item.id === where.id) ?? null,
    update: async ({ where, data }: any) => Object.assign(this.allocations.find((item) => item.id === where.id)!, data),
    delete: async ({ where }: any) => { this.allocations = this.allocations.filter((item) => item.id !== where.id); },
  };
  material = { findUnique: async () => ({ id: 'material-1' }) };
  finishedGood = { create: async ({ data }: any) => (this.finishedGoodRecord = { id: 'good-1', ...data }), upsert: async ({ create }: any) => this.finishedGoodRecord ?? (this.finishedGoodRecord = { id: 'good-1', ...create }) };
  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    const snapshot = { allocations: this.allocations.map((allocation) => ({ ...allocation })), project: { ...this.projectRecord }, deleted: this.deleted, finishedGood: this.finishedGoodRecord };
    try { return await callback(this); }
    catch (error) { this.allocations = snapshot.allocations; this.projectRecord = snapshot.project; this.deleted = snapshot.deleted; this.finishedGoodRecord = snapshot.finishedGood; throw error; }
  }
}

class TraceListDatabase {
  findManyArgs: Record<string, unknown> | undefined;
  project = { findMany: async (args: Record<string, unknown>) => { this.findManyArgs = args; return []; } };
  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> { return callback(this); }
}
