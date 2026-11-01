import { Body, Controller, Delete, Get, HttpException, HttpStatus, Inject, Param, Patch, Post } from '@nestjs/common';
import { InsufficientStockError } from '../inventory/inventory.service.js';
import { CreateAllocationDto, CreateProjectDto, UpdateAllocationDto, UpdateProjectStatusDto } from './dto/project.dto.js';
import { ProjectsService } from './projects.service.js';
import { cents } from '../inventory/quantity.js';

@Controller('api/v1/projects')
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}
  @Post() create(@Body() body: CreateProjectDto) { this.assertProject(body); return this.handle(() => this.projects.create(body)); }
  @Get() list() { return this.projects.list(); }
  @Get('board') board() { return this.projects.board(); }
  @Patch(':id/status') updateStatus(@Param('id') id: string, @Body() body: UpdateProjectStatusDto) { if (!['WISHLIST', 'IN_PROGRESS', 'COMPLETED'].includes(body.status)) this.bad('INVALID_PROJECT_STATUS', '项目状态无效。'); return this.handle(() => this.projects.updateStatus(id, body.status)); }
  @Delete(':id') async remove(@Param('id') id: string) { await this.handle(() => this.projects.remove(id)); return { ok: true }; }
  @Post(':id/allocations') createAllocation(@Param('id') id: string, @Body() body: CreateAllocationDto) { this.assertAllocation(body, true); return this.handle(() => this.projects.createAllocation(id, body)); }
  @Patch(':id/allocations/:allocationId') updateAllocation(@Param('id') id: string, @Param('allocationId') allocationId: string, @Body() body: UpdateAllocationDto) { this.assertAllocation(body, false); return this.handle(() => this.projects.updateAllocation(id, allocationId, body)); }
  @Delete(':id/allocations/:allocationId') async removeAllocation(@Param('id') id: string, @Param('allocationId') allocationId: string) { await this.handle(() => this.projects.removeAllocation(id, allocationId)); return { ok: true }; }
  @Post(':id/finished-good') createFinishedGood(@Param('id') id: string) { return this.handle(() => this.projects.createFinishedGood(id)); }

  private async handle<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      const code = (error as { code?: string }).code ?? (error as Error).message;
      if (error instanceof InsufficientStockError || code === 'INSUFFICIENT_STOCK') throw new HttpException({ code: 'INSUFFICIENT_STOCK', message: '库存不足，无法完成扣减。' }, HttpStatus.CONFLICT);
      if (code === 'PROJECT_NOT_FOUND') throw new HttpException({ code, message: '未找到该项目。' }, HttpStatus.NOT_FOUND);
      if (code === 'PROJECT_NOT_COMPLETED') throw new HttpException({ code, message: '项目尚未完成，无法生成成品。' }, HttpStatus.CONFLICT);
      if (code === 'PROJECT_ARCHIVED') throw new HttpException({ code, message: '已归档项目不可修改材料或删除。' }, HttpStatus.CONFLICT);
      if (code === 'MATERIAL_NOT_FOUND') throw new HttpException({ code, message: '未找到该材料。' }, HttpStatus.NOT_FOUND);
      if (code === 'INVALID_QUANTITY') throw new HttpException({ code, message: (error as Error).message }, HttpStatus.BAD_REQUEST);
      throw error;
    }
  }
  private assertProject(body: CreateProjectDto): void { if (![body.name, body.type, body.primaryColor].every((value) => typeof value === 'string' && value.trim())) this.bad('INVALID_PROJECT_INPUT', '项目名称、类型和主色不能为空。'); }
  private assertAllocation(body: { materialId?: string; quantity?: string }, requireMaterial: boolean): void { try { if ((requireMaterial && !body.materialId?.trim()) || cents(body.quantity) <= 0n) this.bad('INVALID_ALLOCATION_QUANTITY', '领料数量必须大于零。'); } catch { this.bad('INVALID_ALLOCATION_QUANTITY', '领料数量必须大于零。'); } }
  private bad(code: string, message: string): never { throw new HttpException({ code, message }, HttpStatus.BAD_REQUEST); }
}
