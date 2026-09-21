const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { db, dataDir } = require('./db');

const now = () => new Date().toISOString();
function secret() {
  if (process.env.TOKEN_SECRET) return process.env.TOKEN_SECRET;
  const file = path.join(dataDir, 'secret.key');
  if (!fs.existsSync(file)) { fs.writeFileSync(file, crypto.randomBytes(32)); try { fs.chmodSync(file, 0o600); } catch {} }
  return fs.readFileSync(file);
}
function hashPassword(password, salt = crypto.randomBytes(16)) { return { salt: salt.toString('base64url'), hash: crypto.scryptSync(password, salt, 64).toString('base64url') }; }
function verifyPassword(password, row) { return crypto.timingSafeEqual(Buffer.from(hashPassword(password, Buffer.from(row.password_salt, 'base64url')).hash), Buffer.from(row.password_hash)); }
function tokenFor(user) {
  const hours = Number(user.session_hours)||168;const payload = Buffer.from(JSON.stringify({ sub: user.id, username: user.username, role: user.role, exp: Date.now() + hours*3600000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function userFromToken(token) {
  const [payload, sig] = String(token || '').split('.'); if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let data; try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
  if (!data.exp || data.exp < Date.now()) return null;
  const u=db.prepare('SELECT id, username, display_name, role, must_change_password, is_active FROM users WHERE id=?').get(data.sub);if(!u||!u.is_active)return null;return u;
}
function ensureAdmin() {
  if (db.prepare('SELECT COUNT(*) count FROM users').get().count) return;
  const password = process.env.ADMIN_PASSWORD || 'Hardware@2026', p = hashPassword(password);
  db.prepare('INSERT INTO users(username,display_name,role,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?)').run(process.env.ADMIN_USERNAME || 'admin', 'Administrator', 'admin', p.hash, p.salt, process.env.ADMIN_PASSWORD ? 0 : 1, now());
}
function requireAuth(req, res, next) { const user = userFromToken((req.headers.authorization || '').replace(/^Bearer\s+/i, '')); if (!user) return res.status(401).json({ ok:false, error:'Unauthorized' }); req.user = user; next(); }
function requireAdmin(req,res,next){if(!req.user||req.user.role!=='admin')return res.status(403).json({ok:false,error:'需要管理员权限'});next();}
module.exports = { now, hashPassword, verifyPassword, tokenFor, userFromToken, ensureAdmin, requireAuth, requireAdmin };
