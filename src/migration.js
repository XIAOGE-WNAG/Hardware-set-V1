const { db } = require('./db');
const { now } = require('./auth');

const json = value => JSON.stringify(value === undefined ? {} : value);
const one = (sql, params=[]) => db.prepare(sql).get(...params);

function migrateLocal(data={}, userId=1) {
  const t=now(), project=data.project||{};
  let projectId=project.id && one('SELECT id FROM projects WHERE id=? AND user_id=?',[project.id,userId])?.id;
  if(!projectId&&project.name) projectId=one('SELECT id FROM projects WHERE user_id=? AND name=? AND plan_code=? ORDER BY id LIMIT 1',[userId,project.name,project.planCode||''])?.id;
  const settings={...project}; if(data.page) settings.page=data.page;
  if(projectId) db.prepare('UPDATE projects SET name=?,plan_code=?,settings=?,updated_at=? WHERE id=?').run(project.name||'迁移项目',project.planCode||'',json(settings),t,projectId);
  else projectId=Number(db.prepare('INSERT INTO projects(user_id,name,plan_code,settings,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(userId,project.name||'迁移项目',project.planCode||'',json(settings),t,t).lastInsertRowid);
  const products=new Map(), sets=new Map();
  const productRows=[...(data.products||[])];
  for(const row of data.productDatabase||[]) if(Array.isArray(row)) productRows.push({skuCode:row[0],name:row[1]||row[0],model:row[0],specs:{description:row[1]||''},unit:row[2]||'',brand:row[3]||''});
  for(const p of productRows){
    const row=Array.isArray(p)?{skuCode:p[0],name:p[1],model:p[2],specs:p[3],finish:p[4],unit:p[5]}:p;
    const sku=String(row.skuCode||row.sku||row.model||'').trim(); if(!sku) continue;
    const old=one('SELECT id FROM products WHERE sku_code=?',[sku]);
    if(old){products.set(sku,old.id);db.prepare('UPDATE products SET name=?,model=?,finish=?,unit=?,specs=? WHERE id=?').run(row.name||sku,row.model||sku,row.finish||'',row.unit||'',json(row.specs||row),old.id);}
    else {const x=db.prepare('INSERT INTO products(sku_code,name,model,finish,unit,specs) VALUES(?,?,?,?,?,?)').run(sku,row.name||sku,row.model||sku,row.finish||'',row.unit||'',json(row.specs||row));products.set(sku,Number(x.lastInsertRowid));}
  }
  for(const s of data.sets||[]){
    const code=String(s.code||s.setCode||'').trim(); if(!code) continue;
    const old=one('SELECT id FROM hardware_sets WHERE set_code=?',[code]);
    const id=old?.id||Number(db.prepare('INSERT INTO hardware_sets(set_code,name,material,door_type,fire_rating,remark) VALUES(?,?,?,?,?,?)').run(code,s.name||code,s.material||'',s.doorType||s.door||'',s.fireRating||'',s.remark||'').lastInsertRowid);
    sets.set(code,id); if(old) db.prepare('UPDATE hardware_sets SET name=?,material=?,door_type=?,fire_rating=?,remark=? WHERE id=?').run(s.name||code,s.material||'',s.doorType||s.door||'',s.fireRating||'',s.remark||'',id);
    if(Array.isArray(s.items)){db.prepare('DELETE FROM hardware_set_items WHERE set_id=?').run(id);const ins=db.prepare('INSERT INTO hardware_set_items(set_id,product_id,quantity_per_door,remark) VALUES(?,?,?,?)');for(const item of s.items){const sku=Array.isArray(item)?item[0]:item.skuCode||item.sku;const pid=products.get(String(sku));if(pid)ins.run(id,pid,Number(item.quantityPerDoor||item.qty||item[4]||1),item.remark||'');}}
  }
  if(Array.isArray(data.doors)){db.prepare('DELETE FROM door_schedules WHERE project_id=?').run(projectId);const ins=db.prepare('INSERT INTO door_schedules(project_id,seq,floor,door_number,door_model,room_function,width,height,thickness,qty,material,door_type,set_id,section,remark) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');data.doors.forEach((d,i)=>{const a=Array.isArray(d)?d:null,code=a?a[11]:d.setCode;ins.run(projectId,a?a[0]??i:d.seq??i,a?a[1]:d.floor||'',a?a[2]:d.doorNumber||'',a?a[3]:d.doorModel||'',a?a[4]:d.roomFunction||'',a?a[5]:d.width??null,a?a[6]:d.height??null,a?a[7]:d.thickness??null,a?a[8]||1:d.qty||1,a?a[9]:d.material||'',a?a[10]:d.doorType||'',sets.get(String(code))||null,a?a[12]:d.section||'',a?a[13]:d.remark||'');});}
  for(const [sku,page] of Object.entries(data.productDatabase||data.productPages||{})){const old=one('SELECT id FROM product_pages WHERE sku_code=?',[sku]);if(old)db.prepare('UPDATE product_pages SET page_json=?,source_file_json=?,updated_at=? WHERE sku_code=?').run(json(page),json(page.sourceFile),t,sku);else db.prepare('INSERT INTO product_pages(sku_code,page_json,source_file_json,created_at,updated_at) VALUES(?,?,?,?,?)').run(sku,json(page),json(page.sourceFile),t,t);}
  return projectId;
}
module.exports={migrateLocal};
