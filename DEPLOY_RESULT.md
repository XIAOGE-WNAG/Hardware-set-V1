# 部署与验收记录

## 启动

```bash
npm install --omit=dev
npm start
```

默认监听 `0.0.0.0:3001`，可通过 `PORT` 环境变量修改。

默认管理员：`admin / Hardware@2026`。首次登录必须修改密码；生产环境应设置 `ADMIN_PASSWORD` 与 `TOKEN_SECRET`。

## 已实现接口

- 鉴权：`/api/health`、`/api/auth/login`、`/api/auth/me`、`/api/auth/change-password`
- 项目与版本：`/api/projects`
- 分类与产品：`/api/categories`、`/api/products`
- 五金组与明细：`/api/sets`
- 门表：`/api/doors`
- BOM：`/api/bom`
- 产品单页：`/api/product-pages`
- 上传：`/api/upload/image`、`/api/upload/document`
- 导入导出：`/api/import/excel`、`/api/export/xlsx`、`/api/export/xlsx/template`
- 迁移与恢复：`/api/migrate/local`、`/api/state`

## 自测结果

`npm run verify` 已通过，覆盖健康检查、未授权拦截、登录、项目/产品/五金组/门表 CRUD、BOM 按樘数加权、产品单页、文档上传和真实 XLSX 响应。静态首页与 API 资源在本地临时端口启动验证通过。

最新提交：`ce8f1c3`
