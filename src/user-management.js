const router=require('express').Router();
const {randomUUID}=require('node:crypto');
const {db}=require('./db');
const {requireAdmin,requireRole,hashPassword,now}=require('./auth');
const manager=requireRole('admin','company_admin');
const organization=u=>u.organization_id && u.organization_id!=='default'?u.organization_id:null;
const safe=u=>({id:u.id,username:u.username,displayName:u.display_name,role:u.role,
  organizationId:u.role==='admin'?null:organization(u),status:u.status,
  sessionHours:u.session_hours,expiresAt:u.expires_at,mustChangePassword:!!u.must_change_password});
const canEdit=(actor,target)=>actor.role==='admin'||(organization(actor)&&target.role!=='admin'&&organization(actor)===organization(target));
const fail=(r,code,message)=>r.status(code).json({ok:false,error:message});
router.get('/organizations',manager,(q,r)=>{
  const rows=q.user.role==='admin'?db.prepare('SELECT * FROM organizations ORDER BY name').all():
    db.prepare('SELECT * FROM organizations WHERE id=?').all(organization(q.user)||'');
  r.json({ok:true,data:rows});
});
router.post('/organizations',requireAdmin,(q,r)=>{
  const name=String(q.body.name||'').trim();
  if(!name||name.length>100)return fail(r,400,'组织名称须为1至100字');
  if(db.prepare('SELECT id FROM organizations WHERE name=?').get(name))return fail(r,409,'组织名称已存在');
  const id=randomUUID();db.prepare('INSERT INTO organizations VALUES(?,?,?)').run(id,name,now());
  r.status(201).json({ok:true,data:{id,name}});
});
router.delete('/organizations/:id',requireAdmin,(q,r)=>{
  if(db.prepare('SELECT id FROM users WHERE organization_id=? AND deleted_at IS NULL').get(q.params.id))return fail(r,409,'请先转移或删除组织内账户');
  db.prepare('DELETE FROM organizations WHERE id=?').run(q.params.id);r.json({ok:true});
});
router.get('/users',manager,(q,r)=>{
  const rows=q.user.role==='admin'?db.prepare('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY id').all():
    (organization(q.user)?db.prepare("SELECT * FROM users WHERE organization_id=? AND role<>'admin' AND deleted_at IS NULL ORDER BY id").all(organization(q.user)):[]);
  r.json({ok:true,data:rows.map(safe)});
});
function validate(b,u){
  const role=b.role??u?.role??'viewer';
  if(!['admin','company_admin','editor','viewer'].includes(role))throw Error('角色无效');
  const org=role==='admin'?null:(b.organizationId===undefined?organization(u||{}):b.organizationId);
  if(org&&!db.prepare('SELECT id FROM organizations WHERE id=?').get(org))throw Error('请选择有效组织');
  if(role==='company_admin'&&!org)throw Error('公司管理员必须分配组织');
  const username=String(b.username??u?.username??'').trim();
  if(!username||username.length>80)throw Error('用户名须为1至80字');
  if(b.password!==undefined&&String(b.password).length<6)throw Error('密码至少6位');
  const hours=Number(b.sessionHours??u?.session_hours??168);
  if(!Number.isInteger(hours)||hours<1||hours>8760)throw Error('登录有效期须为1至8760小时');
  const status=b.status??u?.status??'active';
  if(!['active','disabled','locked'].includes(status))throw Error('状态无效');
  let expires=u?.expires_at||null;
  if(b.accountDays!==undefined){
    const days=Number(b.accountDays);
    if(!Number.isInteger(days)||days<0||days>36500)throw Error('账户有效天数无效');
    expires=days?new Date(Date.now()+days*86400000).toISOString():null;
  }
  return {role,org,username,hours,status,expires,display:String(b.displayName??u?.display_name??username)};
}
router.post('/users',requireAdmin,(q,r)=>{
  try{
    if(!q.body.password)return fail(r,400,'请设置初始密码');
    const v=validate(q.body);
    if(db.prepare('SELECT id FROM users WHERE username=?').get(v.username))return fail(r,409,'用户名已存在');
    const p=hashPassword(String(q.body.password));
    const x=db.prepare('INSERT INTO users(username,display_name,role,organization_id,password_hash,password_salt,must_change_password,session_hours,status,is_active,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(v.username,v.display,v.role,v.org||'default',p.hash,p.salt,1,v.hours,v.status,v.status==='active'?1:0,v.expires,now(),now());
    r.status(201).json({ok:true,data:safe(db.prepare('SELECT * FROM users WHERE id=?').get(x.lastInsertRowid))});
  }catch(e){fail(r,400,e.message)}
});
router.put('/users/:id',manager,(q,r)=>{
  const u=db.prepare('SELECT * FROM users WHERE id=?').get(q.params.id);
  if(!u||u.deleted_at||!canEdit(q.user,u))return fail(r,404,'账户不存在或无权访问');
  const b=q.body||{};
  if(q.user.role==='company_admin'&&Object.keys(b).some(k=>!['username','displayName','password'].includes(k)))return fail(r,403,'公司管理员只能修改用户名、显示名和密码');
  try{
    // Existing unassigned company admins can be assigned by a system administrator.
    const v=validate(b,u);
    if((u.id===1||(u.id===q.user.id&&q.user.role==='admin'))&&(v.role!==u.role||v.status!=='active'||v.expires))return fail(r,400,'不能降低自身或初始管理员权限、禁用或设置到期');
    if(db.prepare('SELECT id FROM users WHERE username=? AND id<>?').get(v.username,u.id))return fail(r,409,'用户名已存在');
    db.exec('BEGIN');
    try{
      db.prepare('UPDATE users SET username=?,display_name=?,role=?,organization_id=?,status=?,is_active=?,session_hours=?,expires_at=?,updated_at=? WHERE id=?')
        .run(v.username,v.display,v.role,v.org||'default',v.status,v.status==='active'?1:0,v.hours,v.expires,now(),u.id);
      if(b.password){const p=hashPassword(String(b.password));db.prepare('UPDATE users SET password_hash=?,password_salt=?,must_change_password=1,failed_login_count=0,locked_until=NULL WHERE id=?').run(p.hash,p.salt,u.id);}
      if(b.password||v.org!==organization(u)||v.role!==u.role||v.status!==u.status||v.hours!==u.session_hours||v.expires!==u.expires_at)
        db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=?').run(now(),u.id);
      db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e}
    r.json({ok:true,data:safe(db.prepare('SELECT * FROM users WHERE id=?').get(u.id))});
  }catch(e){fail(r,400,e.message)}
});
router.delete('/users/:id',requireAdmin,(q,r)=>{
  const id=Number(q.params.id);
  if(id===1||id===q.user.id)return fail(r,400,'不能删除自身或初始管理员');
  // Keep IDs stable: retained business records must never attach to a new account.
  const u=db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if(!u)return fail(r,404,'账户不存在');
  db.prepare("UPDATE users SET username=?,display_name='已删除账户',status='disabled',is_active=0,organization_id='default',role='viewer',updated_at=?,deleted_at=? WHERE id=?")
    .run('deleted-'+id+'-'+randomUUID(),now(),now(),id);
  db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=?').run(now(),id);
  r.json({ok:true});
});
module.exports=router;
