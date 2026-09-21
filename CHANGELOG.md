# 部署日志

## 2026-09-21

### fix: toLowerCase undefined 防护
- 问题：登录页控制台报 `Cannot read properties of undefined (reading 'toLowerCase')`
- 原因：搜索过滤函数 `hit(row)` 和 Excel 表头识别未对 null/undefined 做防护
- 修复：加空值检查 + try/catch，错误时静默返回 false
- 提交：见 git log

### fix: pageToolbar 跨 IIFE 闭包
- 问题：`ReferenceError: pageToolbar is not defined`
- 原因：pageToolbar 创建在不同 IIFE 闭包中
- 修复：改用 window.pageToolbar，加空值保护

### fix: backend-sync 死循环
- 问题：产品单页数据库反复加载闪烁
- 原因：viewrender → schedule → hydratePages → product-pages-hydrated → render → viewrender 无限循环
- 修复：删除 viewrender 监听

### style: 选择器 UI 移到顶部工具栏
- 产品单页选择器从预览区移到顶部工具栏，打印时不出现
- 统一水平排列、圆角卡片样式
