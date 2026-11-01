export type ProjectStatus = 'WISHLIST' | 'IN_PROGRESS' | 'COMPLETED';
export interface MaterialAllocation { id: string; projectId: string; materialId: string; quantity: string; }
export interface Project { id: string; name: string; type: string; primaryColor: string; status: ProjectStatus; description: string | null; reference: string | null; completedAt: string | null; allocations: MaterialAllocation[]; }
export interface FinishedGood { id: string; sourceProjectId: string; name: string; type: string; primaryColor: string; completedAt: string; allocations: MaterialAllocation[]; }
