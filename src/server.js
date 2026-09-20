const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { db, initDb, root } = require('./db');
const { now, hashPassword, verifyPassword, tokenFor, ensureAdmin, requireAuth } = require('./auth');
const apiRoutes = require('./routes');

initDb(); ensureAdmin();
const app = express(); app.use(express.json({ limit:'20mb' }));
fs.mkdirSync(path.join(root, 'public', 'uploads'), { recursive:true });
app.get('/api/health', (_req,res)=>res.json({ok:true,version:'1.0.0',time:now()}));
app.post('/api/auth/login',(req,res)=>{const {username,password}=req.body||{},user=db.prepare('SELECT * FROM users WHERE username=?').get(username||'');if(!user||!verifyPassword(String(password||''),user))return res.status(401).json({ok:false,error:'Invalid credentials'});res.json({ok:true,data:{token:tokenFor(user),user:{id:user.id,username:user.username,displayName:user.display_name,role:user.role,mustChangePassword:!!user.must_change_password}}});});
app.get('/api/auth/me',requireAuth,(req,res)=>res.json({ok:true,data:req.user}));
app.post('/api/auth/change-password',requireAuth,(req,res)=>{const password=String(req.body?.password||'');if(password.length<6)return res.status(400).json({ok:false,error:'Password must be at least 6 characters'});const p=hashPassword(password);db.prepare('UPDATE users SET password_hash=?,password_salt=?,must_change_password=0 WHERE id=?').run(p.hash,p.salt,req.user.id);res.json({ok:true});});
app.use('/api',requireAuth,apiRoutes);
app.use('/uploads',express.static(path.join(root,'public/uploads')));
app.use(express.static(root));
app.use((_req,res)=>res.sendFile(path.join(root,'index.html')));
const port=Number(process.env.PORT||3001);app.listen(port,'0.0.0.0',()=>console.log(`hardware-bom listening on 0.0.0.0:${port}`));
