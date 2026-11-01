# Leather Manager

面向个人皮具爱好者的跨端皮具管理系统。首版以响应式网页交付，统一管理皮革材料库存、创作作品和已完成成品；后续可通过同一套 API 接入小程序。

## 产品闭环

```text
材料库存 → 作品领料 → 想做 / 制作中 / 已完成 → 成品档案
```

作品领料会扣减库存；撤销领料或删除作品会回补库存。完成后的作品可生成带材料溯源的成品档案。

## 文档

- [产品需求与设计规格](docs/superpowers/specs/2026-11-01-leather-manager-design.md)
- [实施路线图](docs/roadmap.md)
- [公开项目参考](docs/references.md)

## 规划技术栈

- Web：React + Vite + TypeScript
- API：NestJS + TypeScript，REST API
- 数据库：PostgreSQL
- 图片：S3 兼容对象存储

> 当前仓库仅包含已确认的产品与技术设计，尚未开始实现代码。
