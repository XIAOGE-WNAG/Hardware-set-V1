(() => {
  'use strict';
  const token = () => localStorage.getItem('hw_token');
  let timer = 0, wrapped = false;
  const businessKey = key => /^(door-hardware-project-|door-hardware-product-database|door-hardware-product-page-database|door-hardware-auth-session|door-hardware-project-history)/.test(key);
  const hasLegacyData = () => { for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&businessKey(key))return true;} return false; };
  function clearLegacyData(){const remove=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&businessKey(key))remove.push(key);}remove.forEach(key=>localStorage.removeItem(key));}
  async function hydratePages() {
    if (!token() || !window.hwApi || !window.productPageDb || Object.keys(window.productPageDb).length) return;
    try {
      const result=await window.hwApi.request('/api/product-pages');
      const pages=Object.fromEntries((result.data||[]).map(row=>[row.sku_code,row.page]));
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
    const productRows=products.map(p=>[p.sku_code,p.name,p.model||'',Array.isArray(p.specs?.features)?p.specs.features:(p.specs?.description?[p.specs.description]:[]),p.finish||'',p.unit||'',0,null,p.price||'', '',/^data:image\//.test(p.main_image_url||'')?p.main_image_url:null,p.brand||'']);
    const page=settings.page||window.caseData?.page||{brand:'',name:'',variants:[],features:[],footer:'',photo:null,drawing:null};
    return {doors,sets,products:productRows,project:{...settings,name:source.name||settings.name||'未命名项目',id:source.id},page,productDatabase:productRows.map(p=>[p[0],p[3].join('\n'),p[5],p[11]])};
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
    try { await window.hwApi.request('/api/migrate/local',{method:'POST',body:JSON.stringify({data})}); return true; }
    catch (error) { console.warn('[backend-sync]',error.message); return false; }
  }
  async function syncPages() {
    if (!token() || !window.productPageDb || !window.hwApi) return true;
    try { await window.hwApi.request('/api/product-pages/bulk',{method:'POST',body:JSON.stringify({pages:window.productPageDb})}); return true; }
    catch (error) { console.warn('[page-sync]',error.message); return false; }
  }
  async function syncVersion(item) {
    if(!token()||!window.hwApi||!item?.data)return;
    try{const projects=(await window.hwApi.request('/api/projects')).data||[],project=projects.find(p=>p.name===item.projectName);if(project)await window.hwApi.request('/api/projects/'+project.id+'/versions',{method:'POST',body:JSON.stringify({name:item.name,snapshot:item.data})});}catch(error){console.warn('[version-sync]',error.message);}
  }
  function schedule() {
    clearTimeout(timer); timer=setTimeout(async () => { const legacy=hasLegacyData(); if(legacy){const dataOk=await sync(window.caseData),pagesOk=await syncPages();if(dataOk&&pagesOk)clearLegacyData();} await hydratePages(); await hydrateState(); await hydrateProductDatabase(); },500);
  }
  function attach() {
    if (!window.projectStore || wrapped) return;
    const original=window.projectStore.save.bind(window.projectStore);
    window.projectStore.save=function(data){const result=original(data);schedule();return result;};
    wrapped=true; schedule();
  }
  window.addEventListener('hw-auth-login',schedule);
  window.addEventListener('viewrender',schedule);
  const poll=setInterval(() => { attach(); if(wrapped) clearInterval(poll); },100);
  window.hwBackendBridge={sync,syncPages,syncVersion,clearLegacyData};
})();
