const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const seed = require('./seed');

const root = path.resolve(__dirname, '..');
const dataDir = path.resolve(process.env.HW_DATA_DIR || path.join(root, 'data'));
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'app.db'));

function initDb() {
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, must_change_password INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, plan_code TEXT DEFAULT '', settings TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS project_versions (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, name TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, template_schema TEXT NOT NULL DEFAULT '{}', sort INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, sku_code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, category_id INTEGER, brand TEXT DEFAULT '', model TEXT DEFAULT '', finish TEXT DEFAULT '', unit TEXT DEFAULT '', price REAL NOT NULL DEFAULT 0, main_image_url TEXT DEFAULT '', dimension_draft_url TEXT DEFAULT '', svg_diagram_url TEXT DEFAULT '', specs TEXT NOT NULL DEFAULT '{}', sort INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS hardware_sets (id INTEGER PRIMARY KEY, set_code TEXT NOT NULL, name TEXT NOT NULL, material TEXT DEFAULT '', door_type TEXT DEFAULT '', fire_rating TEXT DEFAULT '', remark TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS hardware_set_items (id INTEGER PRIMARY KEY, set_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity_per_door INTEGER NOT NULL DEFAULT 1, remark TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS door_schedules (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, seq INTEGER, floor TEXT DEFAULT '', door_number TEXT DEFAULT '', door_model TEXT DEFAULT '', room_function TEXT DEFAULT '', width REAL, height REAL, thickness REAL, qty INTEGER NOT NULL DEFAULT 1, material TEXT DEFAULT '', fire_rating TEXT DEFAULT '', door_type TEXT DEFAULT '', set_id INTEGER, section TEXT DEFAULT '', remark TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS product_pages (id INTEGER PRIMARY KEY, product_id INTEGER, sku_code TEXT UNIQUE NOT NULL, page_json TEXT NOT NULL, source_file_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  `);
  for (const table of ['projects','project_versions','categories','products','hardware_sets','hardware_set_items','door_schedules','product_pages']) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`); } catch {}
  }
  if (!db.prepare('SELECT 1 FROM categories LIMIT 1').get()) {
    for (const item of seed.categories) db.prepare('INSERT INTO categories(name,template_schema,sort) VALUES(?,?,?)').run(item.name,JSON.stringify(item.templateSchema||{}),item.sort||0);
  }
  if (!db.prepare('SELECT 1 FROM products LIMIT 1').get()) {
    const category = db.prepare('SELECT id FROM categories ORDER BY id LIMIT 1').get();
    const add = db.prepare('INSERT INTO products(sku_code,name,category_id,brand,model,finish,unit,specs,sort) VALUES(?,?,?,?,?,?,?,?,?)');
    for (const item of seed.products) add.run(item.skuCode,item.name,category.id,item.brand||'',item.model||'',item.finish||'',item.unit||'',JSON.stringify(item.specs||{}),item.sort||0);
  }
  if (!db.prepare('SELECT 1 FROM projects LIMIT 1').get()) {
    const t = new Date().toISOString(), add=db.prepare('INSERT INTO projects(name,plan_code,settings,created_at,updated_at) VALUES(?,?,?,?,?)');
    for (const item of seed.projects) add.run(item.name,item.planCode||'',JSON.stringify(item.settings||{}),t,t);
  }
}

module.exports = { db, initDb, root, dataDir };
