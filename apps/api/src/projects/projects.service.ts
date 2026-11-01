/* eslint-disable @typescript-eslint/no-explicit-any */
import { decimal, cents, quantity } from '../inventory/quantity.js';
import { InventoryService } from '../inventory/inventory.service.js';

export type ProjectStatus = 'WISHLIST' | 'IN_PROGRESS' | 'COMPLETED';
export type CreateProjectInput = { name: string; type: string; primaryColor: string; description?: string; reference?: string };
export type CreateAllocationInput = { materialId: string; quantity: string };

type Database = {
  $transaction<T>(callback: (tx: Database) => Promise<T>): Promise<T>;
  project: Record<string, (...args: any[]) => Promise<any>>;
  materialAllocation?: Record<string, (...args: any[]) => Promise<any>>;
  finishedGood?: Record<string, (...args: any[]) => Promise<any>>;
};

export class ProjectsService {
  constructor(private readonly db: Database, private readonly inventory: InventoryService) {}

  async create(input: CreateProjectInput): Promise<Record<string, unknown>> {
    return this.db.$transaction((tx) => tx.project.create({ data: { ...input, status: 'WISHLIST' } }));
  }

  async list(): Promise<Array<Record<string, unknown>>> {
    return this.db.project.findMany({
      include: {
        allocations: { include: { material: true } },
        finishedGood: { include: { sourceProject: { include: { allocations: { include: { material: true } } } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async board(): Promise<Record<ProjectStatus, Array<Record<string, unknown>>>> {
    const projects = await this.list();
    return { WISHLIST: projects.filter((item) => item.status === 'WISHLIST'), IN_PROGRESS: projects.filter((item) => item.status === 'IN_PROGRESS'), COMPLETED: projects.filter((item) => item.status === 'COMPLETED') };
  }

  async updateStatus(id: string, status: ProjectStatus): Promise<Record<string, unknown>> {
    return this.db.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id } });
      if (!project) throw new Error('PROJECT_NOT_FOUND');
      return tx.project.update({ where: { id }, data: { status, completedAt: status === 'COMPLETED' ? new Date() : null } });
    });
  }

  async remove(id: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id }, include: { allocations: true } });
      if (!project) throw new Error('PROJECT_NOT_FOUND');
      for (const allocation of project.allocations) await this.inventory.changeBalanceInTransaction(tx as never, allocation.materialId, { quantityDelta: decimal(cents(allocation.quantity)) }, 'RETURN', { projectId: id, allocationId: allocation.id });
      await tx.project.delete({ where: { id } });
    });
  }

  async createAllocation(projectId: string, input: CreateAllocationInput): Promise<Record<string, unknown>> {
    const allocationQuantity = quantity(input.quantity);
    try {
      return await this.db.$transaction(async (tx) => {
        const project = await tx.project.findUnique({ where: { id: projectId } });
        if (!project) throw new Error('PROJECT_NOT_FOUND');
        const material = await (tx as any).material.findUnique({ where: { id: input.materialId } });
        if (!material) throw new Error('MATERIAL_NOT_FOUND');
        const allocation = await tx.materialAllocation!.create({ data: { projectId, materialId: input.materialId, quantity: allocationQuantity } });
        await this.inventory.changeBalanceInTransaction(tx as never, input.materialId, { quantityDelta: decimal(-cents(allocationQuantity)) }, 'ALLOCATION', { projectId, allocationId: allocation.id });
        return allocation;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2003') throw new Error('MATERIAL_NOT_FOUND');
      throw error;
    }
  }

  async updateAllocation(projectId: string, allocationId: string, input: { quantity: string }): Promise<Record<string, unknown>> {
    const nextQuantity = quantity(input.quantity);
    return this.db.$transaction(async (tx) => {
      const allocation = await tx.materialAllocation!.findUnique({ where: { id: allocationId } });
      if (!allocation || allocation.projectId !== projectId) throw new Error('PROJECT_NOT_FOUND');
      const delta = cents(nextQuantity) - cents(allocation.quantity);
      if (delta !== 0n) await this.inventory.changeBalanceInTransaction(tx as never, allocation.materialId, { quantityDelta: decimal(-delta) }, delta > 0n ? 'ALLOCATION' : 'RETURN', { projectId, allocationId });
      return tx.materialAllocation!.update({ where: { id: allocationId }, data: { quantity: nextQuantity } });
    });
  }

  async removeAllocation(projectId: string, allocationId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const allocation = await tx.materialAllocation!.findUnique({ where: { id: allocationId } });
      if (!allocation || allocation.projectId !== projectId) throw new Error('PROJECT_NOT_FOUND');
      await this.inventory.changeBalanceInTransaction(tx as never, allocation.materialId, { quantityDelta: decimal(cents(allocation.quantity)) }, 'RETURN', { projectId, allocationId });
      await tx.materialAllocation!.delete({ where: { id: allocationId } });
    });
  }

  async createFinishedGood(id: string): Promise<Record<string, unknown>> {
    return this.db.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id }, include: { allocations: { include: { material: true } }, finishedGood: true } });
      if (!project) throw new Error('PROJECT_NOT_FOUND');
      if (project.status !== 'COMPLETED') throw new Error('PROJECT_NOT_COMPLETED');
      if (project.finishedGood) return { ...project.finishedGood, sourceProject: this.sourceProject(project), allocations: project.allocations };
      const finishedGood = await tx.finishedGood!.create({ data: { sourceProjectId: project.id, name: project.name, type: project.type, primaryColor: project.primaryColor, completedAt: project.completedAt ?? new Date() } });
      return { ...finishedGood, sourceProject: this.sourceProject(project), allocations: project.allocations };
    });
  }

  private sourceProject(project: Record<string, any>): Record<string, unknown> {
    const sourceProject = { ...project };
    delete sourceProject.finishedGood;
    return sourceProject;
  }
}
