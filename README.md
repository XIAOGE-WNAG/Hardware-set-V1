# Hardware Set V1

Node.js 22 全栈版本，保留原有门表、五金配置组、产品清单页和产品单页数据库界面。

## 本地运行

```bash
npm install --omit=dev
npm start
```

打开 `http://127.0.0.1:3001/`。首次启动默认账号为 `admin`，密码为 `Hardware@2026`，首次登录后必须修改密码。生产环境请通过 `.env` 设置 `ADMIN_PASSWORD` 和 `TOKEN_SECRET`。

## 部署

```bash
cp .env.example .env
./deploy/setup.sh
```

服务默认监听 `0.0.0.0:3001`。数据库位于 `data/app.db`，上传文件位于 `public/uploads/`。每日备份由 `deploy/backup.sh` 执行，数据库保留 30 天，上传包保留 14 天。

## API

公开：`GET /api/health`、`POST /api/auth/login`。

鉴权后：`/api/auth/me`、`/api/auth/change-password`、`/api/projects`、`/api/products`、`/api/categories`、`/api/sets`、`/api/doors`、`/api/bom`、`/api/product-pages`、`/api/upload/image`、`/api/upload/document`、`/api/import/excel`、`/api/export/xlsx`、`/api/export/xlsx/template`、`/api/migrate/local`、`/api/state`。

自测：`node verify-library.cjs` 会使用临时 SQLite 数据目录启动隔离服务，验证健康检查、鉴权、CRUD、按樘数加权 BOM、产品单页接口和真实 XLSX 响应。

前端升级期间会兼容读取旧版 `door-hardware-*` 数据；登录后先迁移到 SQLite，迁移成功即清理业务缓存，后续刷新从服务器状态恢复。localStorage 长期只保留 `hw_token` 和界面偏好。
