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

鉴权后：`/api/auth/me`、`/api/auth/change-password`、`/api/projects`、`/api/products`、`/api/categories`、`/api/sets`、`/api/doors`、`/api/bom`、`/api/upload/image`、`/api/import/excel`、`/api/export/xlsx`、`/api/migrate/local`。
