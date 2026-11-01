# Leather Manager MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a responsive single-user web application that tracks leather materials, inventory movements, projects, material allocations, and finished goods.

**Architecture:** A pnpm monorepo separates a React/Vite web client from a NestJS REST API. The API owns inventory transactions and PostgreSQL persistence through Prisma; the web client consumes versioned API endpoints and remains reusable by a future mini-program client.

**Tech Stack:** TypeScript, React, Vite, Tailwind CSS, TanStack Query, NestJS, Prisma, PostgreSQL, Vitest, Playwright, Docker Compose, S3-compatible object storage abstraction.

---

## File structure

- `apps/api/`: NestJS HTTP API, domain services and Prisma access.
- `apps/web/`: React responsive web client and browser tests.
- `packages/contracts/`: API request/response and enum types shared by both applications.
- `infra/docker-compose.yml`: local PostgreSQL and object-storage dependencies.
- `docs/`: operations, API contract and deployment documentation.

### Task 1: Create the monorepo and local development foundation

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.editorconfig`
- Create: `apps/api/package.json`, `apps/web/package.json`, `packages/contracts/package.json`
- Create: `infra/docker-compose.yml`, `.env.example`, `docs/development.md`
- Test: `apps/api/test/app.e2e-spec.ts`, `apps/web/src/App.test.tsx`

- [ ] **Step 1: Write the initial failing health checks**

```ts
// apps/api/test/app.e2e-spec.ts
it('returns the API health payload', async () => {
  await request(app.getHttpServer()).get('/api/v1/health').expect(200).expect({ status: 'ok' });
});

// apps/web/src/App.test.tsx
it('renders the Leather Manager heading', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: '皮具管理' })).toBeVisible();
});
```

- [ ] **Step 2: Run the tests to confirm the scaffold is absent**

Run: `pnpm test`

Expected: FAIL because the workspace packages and application entry points do not exist.

- [ ] **Step 3: Create the minimal workspace, applications and health endpoint**

```json
// pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*
```

```ts
// apps/api/src/health/health.controller.ts
@Controller('api/v1/health')
export class HealthController {
  @Get()
  status() { return { status: 'ok' }; }
}
```

```tsx
// apps/web/src/App.tsx
export function App() {
  return <main><h1>皮具管理</h1></main>;
}
```

- [ ] **Step 4: Add local dependencies and run the checks**

Run: `pnpm install && docker compose -f infra/docker-compose.yml up -d && pnpm lint && pnpm test && pnpm build`

Expected: lint, unit tests, API integration test and both production builds pass.

- [ ] **Step 5: Commit the foundation**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .editorconfig .env.example infra apps packages docs/development.md
git commit -m "feat: scaffold leather manager monorepo"
```

### Task 2: Model materials and immutable inventory movements

**Files:**
- Create: `apps/api/prisma/schema.prisma`, `apps/api/prisma/seed.ts`
- Create: `apps/api/src/materials/materials.service.ts`, `apps/api/src/materials/materials.controller.ts`, `apps/api/src/materials/dto/*.ts`
- Create: `apps/api/src/inventory/inventory.service.ts`
- Create: `packages/contracts/src/material.ts`
- Test: `apps/api/src/materials/materials.service.spec.ts`, `apps/api/test/materials.e2e-spec.ts`

- [ ] **Step 1: Write failing material and inventory tests**

```ts
it('creates a material and records its opening balance', async () => {
  const material = await service.create({ name: '棕色植鞣革', type: '植鞣革', color: '棕色', unit: '平方尺', initialQuantity: '2.00' });
  expect(material.currentQuantity).toBe('2.00');
  expect(await movements.forMaterial(material.id)).toContainEqual(expect.objectContaining({ reason: 'OPENING_BALANCE', quantityDelta: '2.00' }));
});

it('rejects a decrease that would make inventory negative', async () => {
  await expect(service.adjust(materialId, { quantityDelta: '-3.00', reason: '盘点' })).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
});
```

- [ ] **Step 2: Run the focused tests and observe failure**

Run: `pnpm --filter @leather-manager/api test materials.service`

Expected: FAIL because material and inventory services are not implemented.

- [ ] **Step 3: Add the transactional material and movement model**

```prisma
model Material {
  id String @id @default(cuid())
  name String
  type String
  color String
  unit String
  currentQuantity Decimal @db.Decimal(12, 2)
  lowStockThreshold Decimal? @db.Decimal(12, 2)
  movements InventoryMovement[]
}

model InventoryMovement {
  id String @id @default(cuid())
  materialId String
  quantityDelta Decimal @db.Decimal(12, 2)
  reason InventoryReason
  occurredAt DateTime @default(now())
  material Material @relation(fields: [materialId], references: [id])
}
```

Implement `InventoryService.changeBalance()` using one database transaction that locks the material, validates the next balance is non-negative, updates `currentQuantity`, and appends one movement record.

- [ ] **Step 4: Add list filters and deletion guards**

```ts
@Get()
list(@Query() filter: MaterialListQuery) { return this.materials.list(filter); }

@Delete(':id')
remove(@Param('id') id: string) { return this.materials.remove(id); }
```

The list query accepts `q`, `type`, `color`, and `stockStatus`. Deletion returns `409 MATERIAL_HAS_HISTORY` unless current quantity is zero and the material has no allocation or inventory history.

- [ ] **Step 5: Run API verification**

Run: `pnpm --filter @leather-manager/api test && pnpm --filter @leather-manager/api test:e2e`

Expected: material creation, filtering, adjustment, insufficient-stock and deletion-guard cases pass.

- [ ] **Step 6: Commit the material domain**

```bash
git add apps/api/prisma apps/api/src/materials apps/api/src/inventory apps/api/test/materials.e2e-spec.ts packages/contracts/src/material.ts
git commit -m "feat: add material inventory tracking"
```

### Task 3: Add projects, allocations and finished goods

**Files:**
- Create: `apps/api/src/projects/projects.service.ts`, `apps/api/src/projects/projects.controller.ts`, `apps/api/src/projects/dto/*.ts`
- Create: `apps/api/src/finished-goods/finished-goods.service.ts`, `apps/api/src/finished-goods/finished-goods.controller.ts`
- Modify: `apps/api/prisma/schema.prisma`, `packages/contracts/src/project.ts`
- Test: `apps/api/src/projects/projects.service.spec.ts`, `apps/api/test/projects.e2e-spec.ts`

- [ ] **Step 1: Write failing allocation and completion tests**

```ts
it('allocates material and reduces inventory in the same transaction', async () => {
  const allocation = await projects.allocate(projectId, { materialId, quantity: '0.35' });
  expect(allocation.quantity).toBe('0.35');
  expect(await materials.find(materialId)).toMatchObject({ currentQuantity: '1.65' });
});

it('does not create a finished good for a project that is not completed', async () => {
  await expect(finishedGoods.createFromProject(projectId)).rejects.toMatchObject({ code: 'PROJECT_NOT_COMPLETED' });
});
```

- [ ] **Step 2: Run the focused tests and observe failure**

Run: `pnpm --filter @leather-manager/api test projects.service`

Expected: FAIL because project allocation and completion rules do not exist.

- [ ] **Step 3: Add project, allocation and finished-good persistence**

```prisma
enum ProjectStatus { WISHLIST IN_PROGRESS COMPLETED }

model Project {
  id String @id @default(cuid())
  name String
  type String
  primaryColor String
  status ProjectStatus @default(WISHLIST)
  allocations MaterialAllocation[]
  finishedGood FinishedGood?
}

model MaterialAllocation {
  id String @id @default(cuid())
  projectId String
  materialId String
  quantity Decimal @db.Decimal(12, 2)
}
```

Allocation creation, quantity changes, deletion, and project deletion call `InventoryService.changeBalance()` in one transaction. Completion records `completedAt`; finished-good creation copies project metadata and keeps a source-project link.

- [ ] **Step 4: Expose project board and finished-good endpoints**

```ts
@Get('board')
board() { return this.projects.board(); }

@Post(':id/allocations')
allocate(@Param('id') id: string, @Body() input: CreateAllocationInput) { return this.projects.allocate(id, input); }

@Post(':id/finished-good')
createFromProject(@Param('id') id: string) { return this.finishedGoods.createFromProject(id); }
```

- [ ] **Step 5: Run the domain and API tests**

Run: `pnpm --filter @leather-manager/api test && pnpm --filter @leather-manager/api test:e2e`

Expected: allocation, rollback, over-allocation, status change, project deletion recovery, and finished-good traceability pass.

- [ ] **Step 6: Commit the project domain**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/projects apps/api/src/finished-goods apps/api/test/projects.e2e-spec.ts packages/contracts/src/project.ts
git commit -m "feat: add projects allocations and finished goods"
```

### Task 4: Build the materials and inventory web experience

**Files:**
- Create: `apps/web/src/api/client.ts`, `apps/web/src/api/materials.ts`
- Create: `apps/web/src/features/materials/MaterialListPage.tsx`, `MaterialForm.tsx`, `InventoryAdjustmentDialog.tsx`
- Create: `apps/web/src/routes.tsx`, `apps/web/src/components/AppShell.tsx`
- Test: `apps/web/src/features/materials/MaterialListPage.test.tsx`, `apps/web/e2e/materials.spec.ts`

- [ ] **Step 1: Write failing list and adjustment UI tests**

```tsx
it('filters materials by color', async () => {
  renderPage();
  await userEvent.selectOptions(screen.getByLabelText('颜色'), '棕色');
  expect(await screen.findByText('棕色植鞣革')).toBeVisible();
});

it('keeps form values after an insufficient-stock response', async () => {
  renderAdjustment();
  await userEvent.type(screen.getByLabelText('调整数量'), '-3');
  await userEvent.click(screen.getByRole('button', { name: '保存调整' }));
  expect(await screen.findByText('库存不足')).toBeVisible();
  expect(screen.getByLabelText('调整数量')).toHaveValue(-3);
});
```

- [ ] **Step 2: Run the focused UI test**

Run: `pnpm --filter @leather-manager/web test MaterialListPage`

Expected: FAIL because the material route and components are absent.

- [ ] **Step 3: Implement API client, responsive shell and material pages**

```tsx
export function MaterialListPage() {
  const [filters, setFilters] = useSearchParams();
  const { data = [] } = useMaterials(filters);
  return <MaterialTable materials={data} filters={filters} onFiltersChange={setFilters} />;
}
```

The app shell provides the five approved navigation destinations. At mobile width it renders an accessible bottom navigation; at desktop width it renders the same destinations in a side navigation.

- [ ] **Step 4: Add end-to-end material flow coverage**

```ts
test('creates, filters and adjusts a material', async ({ page }) => {
  await page.goto('/materials');
  await page.getByRole('button', { name: '新增材料' }).click();
  await page.getByLabel('名称').fill('棕色植鞣革');
  await page.getByRole('button', { name: '保存材料' }).click();
  await expect(page.getByText('棕色植鞣革')).toBeVisible();
});
```

- [ ] **Step 5: Run web verification**

Run: `pnpm --filter @leather-manager/web test && pnpm --filter @leather-manager/web test:e2e && pnpm --filter @leather-manager/web build`

Expected: list/filter/form/error states, Playwright material flow and production build pass.

- [ ] **Step 6: Commit the material UI**

```bash
git add apps/web/src apps/web/e2e/materials.spec.ts
git commit -m "feat: add material inventory web pages"
```

### Task 5: Build projects, finished goods and dashboard

**Files:**
- Create: `apps/web/src/api/projects.ts`, `apps/web/src/api/finished-goods.ts`
- Create: `apps/web/src/features/projects/ProjectBoardPage.tsx`, `ProjectForm.tsx`, `AllocationDialog.tsx`
- Create: `apps/web/src/features/finished-goods/FinishedGoodListPage.tsx`, `FinishedGoodDetailPage.tsx`
- Create: `apps/web/src/features/dashboard/DashboardPage.tsx`
- Test: `apps/web/src/features/projects/ProjectBoardPage.test.tsx`, `apps/web/e2e/project-to-finished-good.spec.ts`

- [ ] **Step 1: Write failing project workflow tests**

```tsx
it('moves a project from wishlist to in progress', async () => {
  renderBoard();
  await userEvent.click(screen.getByRole('button', { name: '开始制作 短夹' }));
  expect(await screen.findByText('制作中')).toBeVisible();
});

it('shows allocated materials in the finished-good detail', async () => {
  renderFinishedGood();
  expect(await screen.findByText('棕色植鞣革')).toBeVisible();
  expect(screen.getByText('0.35 平方尺')).toBeVisible();
});
```

- [ ] **Step 2: Run the focused workflow test**

Run: `pnpm --filter @leather-manager/web test ProjectBoardPage`

Expected: FAIL because the project board and finished-good pages do not exist.

- [ ] **Step 3: Implement the status board, allocation dialog and completion flow**

```tsx
const columns = [
  { status: 'WISHLIST', title: '想做' },
  { status: 'IN_PROGRESS', title: '制作中' },
  { status: 'COMPLETED', title: '已完成' },
] as const;
```

The allocation dialog queries available material balances and displays the API’s insufficient-stock error inline without clearing its selected material or entered quantity. The completion flow only exposes “生成成品档案” after status is completed.

- [ ] **Step 4: Implement dashboard summaries and finished-good filters**

```tsx
<MetricCard label="材料种类" value={summary.materialCount} />
<MetricCard label="低库存" value={summary.lowStockCount} />
<MetricCard label="制作中" value={summary.inProgressProjectCount} />
```

Finished goods support keyword, type and color filters; their detail links to the source project and material allocations.

- [ ] **Step 5: Add and run browser coverage**

Run: `pnpm --filter @leather-manager/web test && pnpm --filter @leather-manager/web test:e2e`

Expected: a browser test creates a project, allocates 0.35 units, completes it, creates a finished good and sees its material traceability.

- [ ] **Step 6: Commit the workflow UI**

```bash
git add apps/web/src apps/web/e2e/project-to-finished-good.spec.ts
git commit -m "feat: add project and finished good workflows"
```

### Task 6: Add image handling, deployment assets and release verification

**Files:**
- Create: `apps/api/src/media/media.service.ts`, `apps/api/src/media/media.controller.ts`
- Create: `apps/api/src/media/media.service.spec.ts`
- Create: `deploy/docker-compose.production.yml`, `deploy/nginx.conf`, `docs/deployment.md`, `docs/backup-and-restore.md`
- Modify: `README.md`, `.env.example`
- Test: `apps/api/test/media.e2e-spec.ts`, `apps/web/e2e/responsive-navigation.spec.ts`

- [ ] **Step 1: Write failing media and responsive-navigation tests**

```ts
it('rejects a non-image upload without creating media metadata', async () => {
  await request(app.getHttpServer()).post('/api/v1/media').attach('file', Buffer.from('not an image'), 'note.txt').expect(400);
  expect(await mediaRepository.count()).toBe(0);
});
```

```ts
test('uses bottom navigation on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: '主导航' })).toContainText('材料库存');
});
```

- [ ] **Step 2: Run the focused tests and observe failure**

Run: `pnpm --filter @leather-manager/api test media.service && pnpm --filter @leather-manager/web test:e2e -- responsive-navigation`

Expected: FAIL because media validation and responsive browser coverage are absent.

- [ ] **Step 3: Implement guarded media metadata and deployment configuration**

```ts
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
if (!allowedMimeTypes.has(file.mimetype) || file.size > 10 * 1024 * 1024) {
  throw new BadRequestException('只支持 10MB 以内的 JPG、PNG 或 WebP 图片');
}
```

Store object keys and media metadata only after a validated upload succeeds. Deployment documentation specifies required environment variables, reverse proxy configuration, daily PostgreSQL and object-storage backups, and a restore drill that checks project/allocation/finished-good links.

- [ ] **Step 4: Run full release verification**

Run: `pnpm lint && pnpm test && pnpm test:e2e && pnpm build && docker compose -f deploy/docker-compose.production.yml config`

Expected: static checks, all API and web tests, browser flows, production builds and Compose configuration pass.

- [ ] **Step 5: Commit the release assets**

```bash
git add apps/api/src/media apps/api/test/media.e2e-spec.ts apps/web/e2e/responsive-navigation.spec.ts deploy docs README.md .env.example
git commit -m "feat: add media and deployment support"
```

## Plan self-review

- **Spec coverage:** Task 2 covers materials, filters, adjustments, histories and deletion; Task 3 covers projects, allocation, atomic stock updates, completion and traceability; Tasks 4–5 cover responsive navigation, dashboard, forms, feedback states and end-user workflows; Task 6 covers image safety, backup/recovery and deployment. Procurement, sales, roles and mini-program delivery remain absent by design.
- **Placeholder scan:** The plan contains no deferred implementation markers; each task names exact files, commands and test cases.
- **Type consistency:** `Material`, `InventoryMovement`, `Project`, `MaterialAllocation`, `FinishedGood`, `ProjectStatus`, `currentQuantity`, `quantityDelta` and `INSUFFICIENT_STOCK` use the same names across database, API and UI tasks.
