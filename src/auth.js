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

// ---- opaque token: stored only as SHA-256 hash in sessions ----
function newToken() { return crypto.randomBytes(32).toString('base64url'); }
function tokenHash(t) { return crypto.createHash('sha256').update(String(t)).digest('base64url'); }

function audit(userId, username, action, req, detail) {
  try {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
    const ua = String(req.headers['user-agent'] || '').slice(0, 250);
    db.prepare('INSERT INTO audit_logs(user_id,username,action,ip_address,user_agent,detail,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(userId || null, username || null, action, ip, ua, String(detail || '').slice(0, 500), now());
  } catch (e) { console.warn('[audit]', e.message); }
}

function createSession(user, token, req, hours) {
  const sid = crypto.randomBytes(16).toString('base64url');
  const t = now();
  const exp = new Date(Date.now() + hours * 3600000).toISOString();
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
  const ua = String(req.headers['user-agent'] || '').slice(0, 250);
  db.prepare('INSERT INTO sessions(id,user_id,token_hash,device_name,ip_address,user_agent,created_at,last_active_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(sid, user.id, tokenHash(token), 'browser', ip, ua, t, t, exp);
  return { id: sid, expiresAt: exp };
}

function userFromToken(token) {
  if (!token) return null;
  const h = tokenHash(token);
  const row = db.prepare('SELECT s.id sid, s.expires_at sexp, s.revoked_at srev, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').get(h);
  if (!row) return null;
  if (row.srev) return null;
  if (row.sexp < now()) return null;
  if (row.status !== 'active') return null;
  if (row.expires_at && row.expires_at < now()) return null;
  try { db.prepare("UPDATE sessions SET last_active_at=? WHERE id=? AND datetime(last_active_at,'+60 seconds') < ?").run(now(), row.sid, now()); } catch {}
  return {
    id: row.id, username: row.username, display_name: row.display_name,
    role: row.role, organization_id: row.organization_id || 'default', must_change_password: row.must_change_password,
    sessionId: row.sid, sessionExpiresAt: row.sexp,
  };
}

function ensureAdmin() {
  if (db.prepare('SELECT COUNT(*) count FROM users').get().count) return;
  const password = process.env.ADMIN_PASSWORD || 'Hardware@2026', p = hashPassword(password);
  db.prepare("INSERT INTO users(username,display_name,role,password_hash,password_salt,must_change_password,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(process.env.ADMIN_USERNAME || 'admin', 'Administrator', 'admin', p.hash, p.salt, process.env.ADMIN_PASSWORD ? 0 : 1, 'active', now(), now());
}

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || '';
  const user = userFromToken(token);
  if (!user) return res.status(401).json({ ok:false, error:'未登录或登录已过期' });
  req.user = user;
  req.token = token;
  next();
}
function requireAdmin(req, res, next) { if (!req.user || req.user.role !== 'admin') return res.status(403).json({ ok:false, error:'需要管理员权限' }); next(); }
function requireRole(...roles) { return (req, res, next) => { if (!req.user) return res.status(401).json({ok:false,error:'未登录'}); if (!roles.includes(req.user.role)) return res.status(403).json({ok:false,error:'权限不足'}); next(); }; }

module.exports = { now, hashPassword, verifyPassword, newToken, tokenHash, createSession, userFromToken, ensureAdmin, requireAuth, requireAdmin, requireRole, audit };
