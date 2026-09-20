(() => {
  'use strict';
  const token = () => localStorage.getItem('hw_token');
  let timer = 0, wrapped = false, pendingData = null;
  const businessKey = key => /^(door-hardware-project-|door-hardware-product-database|door-hardware-product-page-database|door-hardware-auth-session|door-hardware-project-history)/.test(key);
  const hasLegacyData = () => { for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&businessKey(key))return true;} return false; };
  function clearLegacyData(){const remove=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&businessKey(key))remove.push(key);}remove.forEach(key=>localStorage.removeItem(key));}
  async function uploadDataUrl(value){
    if(!/^data:image\/(?:png|jpeg|webp);base64,/i.test(value)||!window.hwApi)return value;
    const [header,encoded]=value.split(',',2),mime=header.slice(5,header.indexOf(';'))||'image/png';
    const bytes=Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));
    const form=new FormData;form.append('file',new Blob([bytes],{type:mime}),'inline-image.'+(mime==='image/jpeg'?'jpg':mime.split('/')[1]));
    return (await window.hwApi.request('/api/upload/image',{method:'POST',body:form})).data.url;
  }
  async function serverizeImages(value,seen=new WeakSet(),parentKey=''){
    if(typeof value==='string')return await uploadDataUrl(value);
    if(!value||typeof value!=='object'||seen.has(value))return value;
    seen.add(value);
    if(Array.isArray(value)){for(let i=0;i<value.length;i++)value[i]=await serverizeImages(value[i],seen,String(i));return value;}
    for(const key of Object.keys(value)){
      // Uploaded source documents already have a URL; never treat their optional fallback data as an image.
      if(parentKey==='sourceFile'&&key==='data')continue;
      value[key]=await serverizeImages(value[key],seen,key);
    }
    return value;
  }
  async function hydratePages() {
    if (!token() || !window.hwApi || !window.productPageDb || Object.keys(window.productPageDb).length) return;
    try {
      const result=await window.hwApi.request('/api/product-pages');
      const pages=Object.fromEntries((result.data||[]).map(row=>[row.sku_code,{...row.page,sourceFile:row.sourceFile||row.page?.sourceFile||null}]));
      if(Object.keys(pages).length){Object.assign(window.productPageDb,pages);window.saveProductPageDb(window.productPageDb);window.dispatchEvent(new Event('product-pages-hydrated'));}
    } catch (error) { console.warn('[page-hydrate]',error.message); }
  }
  async function hydrateProductDatabase() {
    if (!token() || !window.hwApi || !window.caseData || (window.caseData.productDatabase||[]).length) return;
    try {
      const result=await window.hwApi.request('/api/products');
      const rows=(result.data||[]).map(p=>[p.sku_code,p.specs?.description||p.name||'',p.unit||'',p.brand||'']);
      if(rows.length){window.caseData.productDatabase=rows;window.dispatchEvent(new Event('backend-product-database-hydrated'));window.workbench?.render?.();}
    } catch (error) { console.warn('[product-db-hydrate]',error.message); }
  }
  function stateToCase(state) {
    const source=state.project||{}, settings=source.settings||{}, products=state.products||[], productById=new Map(products.map(p=>[p.id,p]));
    const sets=(state.sets||[]).map(s=>({code:s.set_code,location:s.name||'',types:s.door_type||'',door:s.material||'',qty:0,items:(s.items||[]).map(i=>{const p=productById.get(i.product_id)||i;return [p.sku_code||'',p.name||'',p.finish||'',p.unit||'',Number(i.quantity_per_door)||1,i.brand||''];})}));
    const setById=new Map((state.sets||[]).map((s,i)=>[s.id,sets[i].code]));
    const doors=(state.doors||[]).map((d,i)=>[Number(d.seq)||i+1,d.floor||'',d.door_number||'',d.door_model||'',d.room_function||'',d.width??'/',d.height??'/',d.thickness??'/',Number(d.qty)||1,d.material||'',d.door_type||'',setById.get(d.set_id)||'',d.section||'',d.remark||'']);
    const productRows=products.map(p=>[p.sku_code,p.name,p.model||'',Array.isArray(p.specs?.features)?p.specs.features:(p.specs?.description?[p.specs.description]:[]),p.finish||'',p.unit||'',0,null,p.price||'', '',p.main_image_url||null,p.brand||'']);
    const page=settings.page||window.caseData?.page||{brand:'',name:'',variants:[],features:[],footer:'',photo:null,drawing:null};
    // 规范化项目元信息：保证 name/issued/technician/area 为字符串、total 为非负整数，避免服务端水合后校验失败
    const totalDoors=doors.reduce((n,r)=>n+(Number(r[8])||0),0);
    const project=Object.assign({},settings,{id:source.id,name:source.name||settings.name||'未命名项目',issued:String(settings.issued??''),technician:String(settings.technician??''),area:String(settings.area??''),total:Number.isFinite(Number(settings.total))?Number(settings.total):totalDoors});
    delete project.page;
    return {doors,sets,products:productRows,project,page,productDatabase:productRows.map(p=>[p[0],p[3].join('\n'),p[5],p[11]]),_skuNo:Object.fromEntries(products.filter(p=>p.sku_no).map(p=>[p.sku_code,p.sku_no]))};
  }
  async function hydrateState() {
    if(!token()||!window.hwApi||!window.caseData)return;
    try{
      const projects=(await window.hwApi.request('/api/projects')).data||[], localName=window.caseData.project?.name||'';
      const project=projects.find(p=>p.name===localName)||projects[0]; if(!project)return;
      const state=(await window.hwApi.request('/api/state?projectId='+encodeURIComponent(project.id))).data;
      if(state?.project){window.caseData=stateToCase(state);window.dispatchEvent(new Event('backend-state-hydrated'));window.workbench?.render?.();}
    }catch(error){console.warn('[state-hydrate]',error.message);}
  }
  async function sync(data) {
    if (!token() || !window.hwApi || !data) return;
    try { await serverizeImages(data); await window.hwApi.request('/api/migrate/local',{method:'POST',body:JSON.stringify({data})}); return true; }
    catch (error) { console.warn('[backend-sync]',error.message); return false; }
  }
  async function syncPages() {
    if (!token() || !window.productPageDb || !window.hwApi) return true;
    try { await serverizeImages(window.productPageDb); await window.hwApi.request('/api/product-pages/bulk',{method:'POST',body:JSON.stringify({pages:window.productPageDb})}); return true; }
    catch (error) { console.warn('[page-sync]',error.message); return false; }
  }
  async function syncVersion(item) {
    if(!token()||!window.hwApi||!item?.data)return;
    try{const projects=(await window.hwApi.request('/api/projects')).data||[],project=projects.find(p=>p.name===item.projectName);if(project)await window.hwApi.request('/api/projects/'+project.id+'/versions',{method:'POST',body:JSON.stringify({name:item.name,snapshot:item.data})});}catch(error){console.warn('[version-sync]',error.message);}
  }
  function schedule(data=null) {
    if(data)pendingData=data;
    clearTimeout(timer); timer=setTimeout(async () => {
      const snapshot=pendingData; pendingData=null;
      const legacy=hasLegacyData(),dataOk=snapshot?await sync(snapshot):(legacy?await sync(window.caseData):true),pagesOk=(snapshot||legacy)?await syncPages():true;
      if(dataOk&&pagesOk)clearLegacyData();
      await hydratePages();
      // 仅登录/首次(无 snapshot)时才从服务器回拉并整体替换 caseData；
      // 本地刚保存后不再回拉，避免 workbench.render→viewrender→renderCurrent 重建整页闪屏，
      // 也避免 hydrateState 不含 pages、把刚编辑的产品单页冲掉导致下拉切换闪退。
      if(!snapshot) await hydrateState();
      await hydrateProductDatabase();
    },500);
  }
  function attach() {
    if (!window.projectStore || wrapped) return;
    const original=window.projectStore.save.bind(window.projectStore);
    window.projectStore.save=function(data){const result=original(data);schedule(data);return result;};
    wrapped=true; schedule();
  }
  window.addEventListener('hw-auth-login',schedule);
  window.addEventListener('viewrender',schedule);
  const poll=setInterval(() => { attach(); if(wrapped) clearInterval(poll); },100);
  window.hwBackendBridge={sync,syncPages,syncVersion,clearLegacyData};
})();