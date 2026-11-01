import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { PrismaService } from './prisma.service.js';
import { InventoryService } from './inventory/inventory.service.js';
import { MaterialsService } from './materials/materials.service.js';
import { MaterialsController } from './materials/materials.controller.js';

@Module({
  controllers: [AppController, MaterialsController],
  providers: [PrismaService, { provide: MaterialsService, useFactory: (db: PrismaService) => new MaterialsService(db as never), inject: [PrismaService] }, { provide: InventoryService, useFactory: (db: PrismaService) => new InventoryService(db as never), inject: [PrismaService] }],
})
export class AppModule {}
