(() => {
  'use strict';
  const token = () => localStorage.getItem('hw_token');
  let timer = 0, wrapped = false;
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
  async function sync(data) {
    if (!token() || !window.hwApi || !data) return;
    try { await window.hwApi.request('/api/migrate/local',{method:'POST',body:JSON.stringify({data})}); }
    catch (error) { console.warn('[backend-sync]',error.message); }
  }
  async function syncPages() {
    if (!token() || !window.productPageDb || !window.hwApi) return;
    try { await window.hwApi.request('/api/product-pages/bulk',{method:'POST',body:JSON.stringify({pages:window.productPageDb})}); }
    catch (error) { console.warn('[page-sync]',error.message); }
  }
  function schedule() {
    clearTimeout(timer); timer=setTimeout(() => { hydratePages().finally(() => hydrateProductDatabase()).finally(() => { sync(window.caseData); syncPages(); }); },500);
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
  window.hwBackendBridge={sync,syncPages};
})();
