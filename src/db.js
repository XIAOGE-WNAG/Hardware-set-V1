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
    CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, plan_code TEXT DEFAULT '', settings TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS project_versions (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, name TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, template_schema TEXT NOT NULL DEFAULT '{}', sort INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, sku_code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, category_id INTEGER, brand TEXT DEFAULT '', model TEXT DEFAULT '', finish TEXT DEFAULT '', unit TEXT DEFAULT '', price REAL NOT NULL DEFAULT 0, main_image_url TEXT DEFAULT '', dimension_draft_url TEXT DEFAULT '', svg_diagram_url TEXT DEFAULT '', specs TEXT NOT NULL DEFAULT '{}', sort INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS hardware_sets (id INTEGER PRIMARY KEY, set_code TEXT NOT NULL, name TEXT NOT NULL, material TEXT DEFAULT '', door_type TEXT DEFAULT '', fire_rating TEXT DEFAULT '', remark TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS hardware_set_items (id INTEGER PRIMARY KEY, set_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity_per_door INTEGER NOT NULL DEFAULT 1, remark TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS door_schedules (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, seq INTEGER, floor TEXT DEFAULT '', door_number TEXT DEFAULT '', door_model TEXT DEFAULT '', room_function TEXT DEFAULT '', width REAL, height REAL, thickness REAL, qty INTEGER NOT NULL DEFAULT 1, material TEXT DEFAULT '', fire_rating TEXT DEFAULT '', door_type TEXT DEFAULT '', set_id INTEGER, section TEXT DEFAULT '', remark TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS product_pages (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, product_id INTEGER, sku_code TEXT NOT NULL, page_json TEXT NOT NULL, source_file_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,sku_code));
    CREATE TABLE IF NOT EXISTS product_db (user_id INTEGER PRIMARY KEY, rows TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS case_state (user_id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, device_name TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT NOT NULL, last_active_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT);
    CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, username TEXT, action TEXT, ip_address TEXT, user_agent TEXT, detail TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS project_members (project_id INTEGER NOT NULL, user_id INTEGER NOT NULL, project_role TEXT NOT NULL DEFAULT 'viewer', joined_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id,user_id));
  `);
  try { db.exec("ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN session_hours INTEGER NOT NULL DEFAULT 168"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT '"+new Date().toISOString()+"'"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"); } catch {}
  try { db.exec("UPDATE users SET status=CASE WHEN is_active=0 THEN 'disabled' ELSE COALESCE(status,'active') END WHERE is_active IS NOT NULL"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN expires_at TEXT"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN password_expires_at TEXT"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN locked_until TEXT"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'default'"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN deleted_at TEXT"); } catch {}
  db.exec("CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)");
  db.exec("INSERT OR IGNORE INTO organizations(id,name,created_at) VALUES('default','默认组织',datetime('now'))");
  db.exec("INSERT OR IGNORE INTO organizations(id,name,created_at) SELECT DISTINCT organization_id,organization_id,datetime('now') FROM users WHERE organization_id IS NOT NULL AND organization_id NOT IN ('','default')");
  // Legacy installations used singleton product_db/case_state tables. New installations
  // are user-scoped; old databases are detected and rebuilt by migrateLegacyUserTables.
  migrateLegacyUserTables();
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

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column);
}

function migrateLegacyUserTables() {
  const t = new Date().toISOString();
  if (!hasColumn('product_db', 'user_id')) {
    db.exec('ALTER TABLE product_db RENAME TO product_db_legacy');
    db.exec('CREATE TABLE product_db (user_id INTEGER PRIMARY KEY, rows TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1)');
    const old = db.prepare('SELECT rows,updated_at FROM product_db_legacy WHERE id=1').get();
    if (old) db.prepare('INSERT INTO product_db(user_id,rows,updated_at,version) VALUES(?,?,?,1)').run(1, old.rows, old.updated_at || t);
    db.exec('DROP TABLE product_db_legacy');
  }
  try { db.exec("ALTER TABLE projects ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1"); } catch {}
  if (!hasColumn('case_state', 'user_id')) {
    db.exec('ALTER TABLE case_state RENAME TO case_state_legacy');
    db.exec('CREATE TABLE case_state (user_id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1)');
    const old = db.prepare('SELECT data,updated_at FROM case_state_legacy WHERE id=1').get();
    if (old) db.prepare('INSERT INTO case_state(user_id,data,updated_at,version) VALUES(?,?,?,1)').run(1, old.data, old.updated_at || t);
    db.exec('DROP TABLE case_state_legacy');
  }
  if (!hasColumn('product_pages', 'user_id')) {
    db.exec('ALTER TABLE product_pages RENAME TO product_pages_legacy');
    db.exec('CREATE TABLE product_pages (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, product_id INTEGER, sku_code TEXT NOT NULL, page_json TEXT NOT NULL, source_file_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,sku_code))');
    db.exec('INSERT INTO product_pages(id,user_id,product_id,sku_code,page_json,source_file_json,created_at,updated_at) SELECT id,1,product_id,sku_code,page_json,source_file_json,created_at,updated_at FROM product_pages_legacy');
    db.exec('DROP TABLE product_pages_legacy');
  }
}

module.exports = { db, initDb, root, dataDir };
