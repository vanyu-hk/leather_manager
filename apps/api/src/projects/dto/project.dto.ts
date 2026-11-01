export class CreateProjectDto { name!: string; type!: string; primaryColor!: string; description?: string; reference?: string; }
export class UpdateProjectStatusDto { status!: 'WISHLIST' | 'IN_PROGRESS' | 'COMPLETED'; }
export class CreateAllocationDto { materialId!: string; quantity!: string; }
export class UpdateAllocationDto { quantity!: string; }
