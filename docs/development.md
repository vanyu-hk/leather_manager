# 开发指南

## 安装

使用 Node.js 26 与 pnpm 10：

```bash
pnpm install
cp .env.example .env
```

## 启动本地依赖

```bash
docker compose -f infra/docker-compose.yml up -d
```

该命令启动 PostgreSQL，默认仅绑定到本机回环地址 `127.0.0.1:5432`，不会暴露给局域网。停止依赖可运行：

```bash
docker compose -f infra/docker-compose.yml down
```

## 启动开发服务器

在两个终端分别运行：

```bash
pnpm --filter @leather-manager/api dev
pnpm --filter @leather-manager/web dev
```

API 健康检查地址为 `http://localhost:3000/api/v1/health`；Web 开发服务器会输出本地访问地址。

## 检查

```bash
pnpm lint
pnpm test
pnpm build
```
