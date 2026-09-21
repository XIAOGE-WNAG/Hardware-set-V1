const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { db, initDb, root } = require('./db');
const { now, hashPassword, verifyPassword, newToken, createSession, ensureAdmin, requireAuth, audit } = require('./auth');
const apiRoutes = require('./routes');

initDb(); ensureAdmin();
const app = express(); app.use(express.json({ limit:'20mb' }));
fs.mkdirSync(path.join(root, 'public', 'uploads'), { recursive:true });

// simple in-memory rate limiter
const rl = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (rl.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  rl.set(key, arr);
  return arr.length <= max;
}

app.get('/api/health', (_req,res)=>res.json({ok:true,version:'1.0.0',time:now()}));

// ---- login ----
app.post('/api/auth/login', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
  if (!rateLimit('login:'+ip, 10, 15*60*1000)) return res.status(429).json({ok:false,error:'尝试过于频繁，请15分钟后再试'});
  const { username, password, remember } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(String(username||'').trim());
  // generic error
  const bad = () => res.status(401).json({ok:false,error:'用户名或密码错误'});
  if (!user) { audit(null, username, 'login_fail', req, '用户不存在'); return bad(); }
  // checks
  if (user.status === 'locked') { audit(user.id, user.username, 'login_locked', req, '账号已锁定'); return res.status(403).json({ok:false,error:'账号已锁定，请联系管理员'}); }
  if (user.status === 'disabled') { audit(user.id, user.username, 'login_disabled', req, '账号已禁用'); return res.status(403).json({ok:false,error:'账号已禁用'}); }
  if (user.expires_at && user.expires_at < now()) { audit(user.id, user.username, 'login_expired', req, '账号已过期'); return res.status(403).json({ok:false,error:'账号已过期，请联系管理员'}); }
  if (user.locked_until && user.locked_until > now()) { audit(user.id, user.username, 'login_temp_locked', req, '临时锁定中'); return res.status(429).json({ok:false,error:'失败次数过多，请15分钟后再试'}); }
  if (!verifyPassword(String(password||''), user)) {
    const n = (user.failed_login_count||0) + 1;
    const upd = { failed_login_count: n };
    if (n >= 5) { upd.locked_until = new Date(Date.now()+15*60000).toISOString(); upd.failed_login_count = 0; }
    db.prepare('UPDATE users SET failed_login_count=?, locked_until=? WHERE id=?').run(upd.failed_login_count, upd.locked_until||user.locked_until, user.id);
    audit(user.id, user.username, 'login_fail', req, '密码错误');
    return bad();
  }
  // success
  const hours = user.role === 'admin' ? 2 : (remember ? 168 : 8);
  const token = newToken();
  const sess = createSession(user, token, req, hours);
  db.prepare('UPDATE users SET failed_login_count=0, locked_until=NULL, last_login_at=? WHERE id=?').run(now(), user.id);
  audit(user.id, user.username, 'login_ok', req, '');
  const needPwdChange = !!user.must_change_password || (user.password_expires_at && user.password_expires_at < now());
  res.json({ok:true,data:{token, expiresAt:sess.expiresAt, user:{id:user.id,username:user.username,displayName:user.display_name,role:user.role,mustChangePassword:needPwdChange}}});
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ok:true,data:{id:req.user.id,username:req.user.username,displayName:req.user.display_name,role:req.user.role,mustChangePassword:!!req.user.must_change_password,sessionExpiresAt:req.user.sessionExpiresAt}}));

app.post('/api/auth/logout', requireAuth, (req, res) => {
  db.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').run(now(), req.user.sessionId);
  audit(req.user.id, req.user.username, 'logout', req, '');
  res.json({ok:true});
});

app.post('/api/auth/logout-all', requireAuth, (req, res) => {
  db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(now(), req.user.id);
  audit(req.user.id, req.user.username, 'logout_all', req, '');
  res.json({ok:true});
});

app.post('/api/auth/refresh', requireAuth, (req, res) => {
  const hours = req.user.role === 'admin' ? 2 : 8;
  const token = newToken();
  const sess = createSession(req.user, token, req, hours);
  db.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').run(now(), req.user.sessionId);
  res.json({ok:true,data:{token,expiresAt:sess.expiresAt}});
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const password = String(req.body?.password || '');
  if (password.length < 6) return res.status(400).json({ok:false,error:'密码至少6位'});
  const p = hashPassword(password);
  db.prepare('UPDATE users SET password_hash=?,password_salt=?,must_change_password=0,password_expires_at=NULL WHERE id=?').run(p.hash, p.salt, req.user.id);
  // revoke all sessions
  db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(now(), req.user.id);
  audit(req.user.id, req.user.username, 'password_changed', req, '');
  res.json({ok:true});
});

// self-register (disabled by default; admin creates users)
app.post('/api/auth/register', (req,res)=>{
  res.status(403).json({ok:false,error:'自助注册已关闭，请联系管理员开通账号'});
});

app.use('/api', requireAuth, apiRoutes);
app.use('/uploads', express.static(path.join(root,'public/uploads')));
app.use(express.static(path.join(root,'public'),{setHeaders:(res,p)=>{if(/\.(html|js|css)$/i.test(p))res.setHeader('Cache-Control','no-cache, must-revalidate')}}));
app.use((_req,res)=>res.set('Cache-Control','no-cache, must-revalidate').sendFile(path.join(root,'public/index.html')));
const port=Number(process.env.PORT||3001);app.listen(port,'0.0.0.0',()=>console.log(`hardware-bom listening on 0.0.0.0:${port}`));
