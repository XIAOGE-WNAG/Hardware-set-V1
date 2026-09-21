const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const port=Number(process.env.VERIFY_PORT||3123), dataDir=path.join(__dirname,'.verify-data-'+process.pid);
try{fs.rmSync(dataDir,{recursive:true,force:true})}catch{}
const child=spawn(process.execPath,['src/server.js'],{cwd:__dirname,env:{...process.env,PORT:String(port),HW_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
const base=`http://127.0.0.1:${port}`;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(url,options={}){const response=await fetch(base+url,options),text=await response.text();let body;try{body=JSON.parse(text)}catch{throw new Error(`Expected JSON from ${url}, got ${response.status}: ${text.slice(0,120)}`)}return {status:response.status,body};}
async function main(){
  for(let i=0;i<30;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await sleep(100);}
  const health=await request('/api/health');assert.equal(health.status,200);assert.equal(health.body.ok,true);
  assert.equal((await request('/api/projects')).status,401);
  const login=await request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'Hardware@2026'})});
  assert.equal(login.status,200);assert.equal(login.body.data.user.mustChangePassword,true);const token=login.body.data.token;const auth={Authorization:`Bearer ${token}`,'content-type':'application/json'};
  assert.equal((await request('/api/projects',{headers:{Authorization:'Bearer invalid'}})).status,401);
  assert.equal((await request('/api/auth/me',{headers:auth})).status,200);
  const project=await request('/api/projects',{method:'POST',headers:auth,body:JSON.stringify({name:'验证项目',planCode:'V'})});assert.equal(project.status,201);const projectId=project.body.data.id;
  assert.equal((await request(`/api/state?projectId=${projectId}`,{headers:auth})).status,200);
  const bundle={project:{name:'迁移验证项目',planCode:'M'},productDatabase:[['MIG-1','迁移产品','只','GMT']],doors:[],sets:[],products:[]};
  assert.equal((await request('/api/migrate/local',{method:'POST',headers:auth,body:JSON.stringify({data:bundle})})).status,200);
  assert.equal((await request('/api/migrate/local',{method:'POST',headers:auth,body:JSON.stringify({data:bundle})})).status,200);
  const product=await request('/api/products',{method:'POST',headers:auth,body:JSON.stringify({skuCode:'VERIFY-1',name:'验证产品',model:'VERIFY-1',unit:'只',price:12})});assert.equal(product.status,201);const productId=product.body.data.id;
  const set=await request('/api/sets',{method:'POST',headers:auth,body:JSON.stringify({setCode:'VERIFY-SET',name:'验证组'})});assert.equal(set.status,201);const setId=set.body.data.id;
  assert.equal((await request(`/api/sets/${setId}/items`,{method:'POST',headers:auth,body:JSON.stringify({productId,quantityPerDoor:2})})).status,201);
  assert.equal((await request('/api/doors',{method:'POST',headers:auth,body:JSON.stringify({projectId,doors:[{seq:1,doorNumber:'V-1',setId,qty:3}]})})).status,201);
  const bom=await request(`/api/bom?projectId=${projectId}`,{headers:auth});assert.equal(bom.status,200);assert.equal(bom.body.data[0].total_quantity,6);assert.equal(bom.body.data[0].total_price,72);
  assert.equal((await request('/api/product-pages',{method:'POST',headers:auth,body:JSON.stringify({skuCode:'VERIFY-1',page:{name:'验证单页',variants:[['VERIFY-1','','','']]}})})).status,201);
  assert.equal((await request('/api/product-pages/VERIFY-1',{headers:auth})).body.data.page.name,'验证单页');
  assert.equal((await request('/api/product-pages/bulk',{method:'POST',headers:auth,body:JSON.stringify({pages:{'VERIFY-2':{name:'批量单页'}}})})).body.data.count,1);
  const imageForm=new FormData();imageForm.append('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'verify.png');const imageUpload=await fetch(base+'/api/upload/image',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:imageForm});assert.equal(imageUpload.status,201);const imageBody=await imageUpload.json();assert.match(imageBody.data.url,/^\/uploads\//);fs.rmSync(path.join(__dirname,'public',imageBody.data.url.replace(/^\//,'')),{force:true});
  const documentForm=new FormData();documentForm.append('file',new Blob([Buffer.from('%PDF-1.4 verify')],{type:'application/pdf'}),'verify.pdf');const uploaded=await fetch(base+'/api/upload/document',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:documentForm});assert.equal(uploaded.status,201);const uploadedBody=await uploaded.json();fs.rmSync(path.join(__dirname,'public',uploadedBody.data.url.replace(/^\//,'')),{force:true});
  const xlsx=await fetch(base+`/api/export/xlsx?projectId=${projectId}`,{headers:auth});assert.equal(xlsx.status,200);assert.equal(xlsx.headers.get('content-type'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  // multi-user isolation, status field, session policy and product-db clear semantics
  const createdUser=await request('/api/users',{method:'POST',headers:auth,body:JSON.stringify({username:'verify-editor',displayName:'Verify Editor',password:'Verify@123',role:'editor',sessionHours:24})});
  assert.equal(createdUser.status,201);assert.equal(createdUser.body.data.status,'active');
  const userLogin=await request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'verify-editor',password:'Verify@123'})});
  assert.equal(userLogin.status,200);const userAuth={Authorization:`Bearer ${userLogin.body.data.token}`,'content-type':'application/json'};
  const userProjects=await request('/api/projects',{headers:userAuth});assert.equal(userProjects.status,200);assert.equal(userProjects.body.data.some(x=>x.id===projectId),false);
  assert.equal((await request('/api/product-db',{method:'PUT',headers:userAuth,body:JSON.stringify({rows:[['CLEAR-1','temporary','只','TEST']]})})).status,200);
  assert.equal((await request('/api/product-db',{headers:userAuth})).body.data.rows.length,1);
  assert.equal((await request('/api/product-db',{method:'PUT',headers:userAuth,body:JSON.stringify({rows:[]})})).body.data.count,0);
  assert.deepEqual((await request('/api/product-db',{headers:userAuth})).body.data.rows,[]);
  assert.equal((await request('/api/users/'+createdUser.body.data.id,{method:'PUT',headers:auth,body:JSON.stringify({status:'disabled'})})).body.data.status,'disabled');
  assert.equal((await request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'verify-editor',password:'Verify@123'})})).status,403);
  const orgA=await request('/api/organizations',{method:'POST',headers:auth,body:JSON.stringify({name:'Company A'})});
  const orgB=await request('/api/organizations',{method:'POST',headers:auth,body:JSON.stringify({name:'Company B'})});
  assert.equal(orgA.status,201);assert.equal(orgB.status,201);
  const organizationId=orgA.body.data.id;
  assert.equal((await request('/api/users/'+createdUser.body.data.id,{method:'PUT',headers:auth,body:JSON.stringify({organizationId})})).status,200);
  const other=await request('/api/users',{method:'POST',headers:auth,body:JSON.stringify({username:'other-company',password:'Verify@123',role:'viewer',organizationId:orgB.body.data.id})});
  assert.equal(other.status,201);
  const companyAdmin=await request('/api/users',{method:'POST',headers:auth,body:JSON.stringify({username:'verify-company-admin',displayName:'Company Admin',password:'Company@123',role:'company_admin',sessionHours:24,organizationId})});
  assert.equal(companyAdmin.status,201);const companyLogin=await request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'verify-company-admin',password:'Company@123'})});
  assert.equal(companyLogin.status,200);const companyAuth={Authorization:`Bearer ${companyLogin.body.data.token}`,'content-type':'application/json'};
  assert.equal((await request('/api/users',{headers:companyAuth})).status,200);
  const visible=(await request('/api/users',{headers:companyAuth})).body.data;
  assert.deepEqual(visible.map(u=>u.id).sort(),[createdUser.body.data.id,companyAdmin.body.data.id].sort());
  assert.equal((await request('/api/organizations',{headers:companyAuth})).body.data.length,1);
  for(const id of [1,other.body.data.id]){
    assert.equal((await request('/api/users/'+id,{method:'PUT',headers:companyAuth,body:JSON.stringify({password:'Illegal@123'})})).status,404);
  }
  for(const body of [{organizationId:orgB.body.data.id},{status:'disabled'},{sessionHours:500},{accountDays:30},{isActive:false}]){
    assert.equal((await request('/api/users/'+createdUser.body.data.id,{method:'PUT',headers:companyAuth,body:JSON.stringify(body)})).status,403);
  }
  assert.equal((await request('/api/users/'+createdUser.body.data.id,{method:'PUT',headers:companyAuth,body:JSON.stringify({username:'verify-editor-renamed',displayName:'Renamed Editor',password:'New@12345'})})).status,200);
  const companyCreated=await request('/api/users',{method:'POST',headers:companyAuth,body:JSON.stringify({username:'company-scoped-user',password:'Verify@123',role:'viewer'})});
  assert.equal(companyCreated.status,403);
  assert.equal((await request('/api/users/'+createdUser.body.data.id,{method:'PUT',headers:companyAuth,body:JSON.stringify({role:'admin'})})).status,403);
  assert.equal((await request('/api/users/'+createdUser.body.data.id,{method:'DELETE',headers:companyAuth})).status,403);
  assert.equal((await request('/api/organizations',{method:'POST',headers:companyAuth,body:JSON.stringify({name:'Forbidden'})})).status,403);
  assert.equal((await request('/api/organizations/'+organizationId,{method:'DELETE',headers:auth})).status,409);
  assert.equal((await request('/api/users/'+other.body.data.id,{method:'DELETE',headers:auth})).status,200);
  assert.equal((await request('/api/users',{headers:auth})).body.data.some(u=>u.id===other.body.data.id),false);
  console.log('PASS health/auth/CRUD/BOM/upload/xlsx/multi-user/product-db-clear/status/company-admin-rbac');
}
main().catch(error=>{console.error('FAIL',error);process.exitCode=1}).finally(()=>{child.kill();});
