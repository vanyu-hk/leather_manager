import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { PrismaService } from './prisma.service.js';
import { InventoryService } from './inventory/inventory.service.js';
import { MaterialsService } from './materials/materials.service.js';
import { MaterialsController } from './materials/materials.controller.js';
import { ProjectsController } from './projects/projects.controller.js';
import { ProjectsService } from './projects/projects.service.js';

@Module({
  controllers: [AppController, MaterialsController, ProjectsController],
  providers: [PrismaService, { provide: MaterialsService, useFactory: (db: PrismaService) => new MaterialsService(db as never), inject: [PrismaService] }, { provide: InventoryService, useFactory: (db: PrismaService) => new InventoryService(db as never), inject: [PrismaService] }, { provide: ProjectsService, useFactory: (db: PrismaService, inventory: InventoryService) => new ProjectsService(db as never, inventory), inject: [PrismaService, InventoryService] }],
})
export class AppModule {}
