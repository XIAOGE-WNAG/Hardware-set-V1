(() => {
  'use strict';
  const token = () => localStorage.getItem('hw_token');
  let timer = 0, wrapped = false;
  async function sync(data) {
    if (!token() || !window.hwApi || !data) return;
    try { await window.hwApi.request('/api/migrate/local',{method:'POST',body:JSON.stringify({data})}); }
    catch (error) { console.warn('[backend-sync]',error.message); }
  }
  async function syncPages() {
    if (!token() || !window.productPageDb || !window.hwApi) return;
    for (const [sku,page] of Object.entries(window.productPageDb)) {
      try { await window.hwApi.request('/api/product-pages/'+encodeURIComponent(sku),{method:'PUT',body:JSON.stringify({skuCode:sku,page})}); }
      catch (error) {
        if (/404/.test(error.message)) try { await window.hwApi.request('/api/product-pages',{method:'POST',body:JSON.stringify({skuCode:sku,page})}); } catch (e) { console.warn('[page-sync]',e.message); }
      }
    }
  }
  function schedule() {
    clearTimeout(timer); timer=setTimeout(() => { sync(window.caseData); syncPages(); },500);
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
