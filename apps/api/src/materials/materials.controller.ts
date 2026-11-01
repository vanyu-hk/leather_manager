import { BadRequestException, Body, Controller, Delete, Get, HttpException, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { InventoryService, InsufficientStockError } from '../inventory/inventory.service.js';
import { AdjustMaterialDto, CreateMaterialDto, ListMaterialsDto } from './dto/material.dto.js';
import { MaterialsService } from './materials.service.js';

@Controller('api/v1/materials')
export class MaterialsController {
  constructor(@Inject(MaterialsService) private readonly materials: MaterialsService, @Inject(InventoryService) private readonly inventory: InventoryService) {}
  @Post() async create(@Body() body: CreateMaterialDto) { try { return await this.materials.create(body); } catch (error) { if ((error as { code?: string }).code === 'INVALID_QUANTITY') throw new BadRequestException({ code: 'INVALID_QUANTITY', message: (error as Error).message }); throw error; } }
  @Get() list(@Query() query: ListMaterialsDto) { return this.materials.list(query); }
  @Post(':id/adjustments') async adjust(@Param('id') id: string, @Body() body: AdjustMaterialDto) {
    try { await this.inventory.changeBalance(id, body); return { ok: true }; }
    catch (error) { if (error instanceof InsufficientStockError) throw new HttpException({ code: error.code, message: error.message }, HttpStatus.CONFLICT); if ((error as Error).message === 'MATERIAL_NOT_FOUND') throw new HttpException({ code: 'MATERIAL_NOT_FOUND', message: '未找到该材料。' }, HttpStatus.NOT_FOUND); if ((error as { code?: string }).code === 'INVALID_QUANTITY') throw new BadRequestException({ code: 'INVALID_QUANTITY', message: (error as Error).message }); throw error; }
  }
  @Delete(':id') async remove(@Param('id') id: string) {
    try { await this.materials.remove(id); return { ok: true }; }
    catch (error) { if ((error as { code?: string }).code === 'MATERIAL_HAS_HISTORY') throw new HttpException({ code: 'MATERIAL_HAS_HISTORY', message: (error as Error).message }, HttpStatus.CONFLICT); if ((error as Error).message === 'MATERIAL_NOT_FOUND') throw new HttpException({ code: 'MATERIAL_NOT_FOUND', message: '未找到该材料。' }, HttpStatus.NOT_FOUND); throw error; }
  }
}
