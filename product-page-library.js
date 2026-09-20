/* Standalone product-page library. Never writes projectStore or caseData. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => structuredClone(value);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const state = { active:false, selected:'', selectedMany:[], draft:null, original:'', dirty:false, pending:0, hidden:[], scroll:0 };
  let root;
  const db = () => window.productPageDb;
  const blank = () => window.productPageBlank();
  const displayLabel = code => {const page=db()[code]||{},name=String(page.name||'').trim(),a=code.replace(/[\s\-_,，、。]/g,''),b=name.replace(/[\s\-_,，、。]/g,'');return name&&a===b?name:(name?`${code} · ${name}`:code);};
  const normalize = page => ({...blank(), ...clone(page), variants:(page.variants || []).map(row=>Array.from({length:4},(_,i)=>String(row[i]??''))), features:(page.features||[]).map(String)});
  function message(text) { root.querySelector('[data-library-status]').textContent=text; }
  function persist(next) {
    window.saveProductPageDb(next); // Commit storage before changing in-memory data.
    for(const key of Object.keys(db())) delete db()[key];
    Object.assign(db(), next);
    window.hwBackendBridge?.syncPages().then(ok=>{if(ok)window.hwBackendBridge.clearLegacyData();});
  }
  function download(value, name) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function downloadBlob(blob, name) {
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function pageTitle(page){return String(page?.name||state.selected||'产品单页').replace(/[\\/:*?"<>|]/g,'_').trim()||'产品单页';}
  async function loadScript(src,ready){
    if(ready())return;
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('解析组件加载失败，请检查网络连接'));document.head.appendChild(s);});
    if(!ready())throw Error('解析组件未正确加载');
  }
  const dataUrl = (value,type='image/png') => `data:${type};base64,${value}`;
  async function uploadImage(file){
    if(window.hwApi&&localStorage.getItem('hw_token')){const form=new FormData;form.append('file',file);try{return (await window.hwApi.request('/api/upload/image',{method:'POST',body:form})).data.url;}catch(error){console.warn('[image-upload]',error.message);}}
    return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(file);});
  }
  async function uploadDocument(file){
    if(window.hwApi&&localStorage.getItem('hw_token')){const form=new FormData;form.append('file',file);try{const result=(await window.hwApi.request('/api/upload/document',{method:'POST',body:form})).data;return {...result,data:null};}catch(error){console.warn('[document-upload]',error.message);}}
    return {name:file.name,type:file.type||'application/octet-stream',data:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);})};
  }
  function textLines(text){return String(text||'').split(/\r?\n/).map(s=>s.replace(/[ \t]+/g,' ').trim()).filter(Boolean);}
  function structuredPage(fileName,text,images){
    const lines=textLines(text), name=(lines.find(line=>line.length>2&&line.length<80)||fileName.replace(/\.(pdf|docx?)$/i,''));
    const variantLines=lines.filter(line=>/[A-Z]{1,6}\d{2,}[A-Z0-9-]*/i.test(line));
    const variants=variantLines.slice(0,20).map(line=>{const parts=line.split(/\s{2,}|\t|,/).map(s=>s.trim()).filter(Boolean);return [parts[0]||line,parts.slice(1,-2).join(' ')||'',parts.at(-2)||'',parts.at(-1)||''];});
    return normalize({name,brand:'GMT',photo:null,drawing:null,variants,features:lines.slice(0,60),sourceFile:{name:fileName,type:'application/octet-stream'}});
  }
  async function parsePdf(file){
    await loadScript('vendor/pdf.min.js',()=>window.pdfjsLib);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js';
    const pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,lines=[],images=[];
    for(let n=1;n<=pdf.numPages;n++){
      const page=await pdf.getPage(n),content=await page.getTextContent();lines.push(content.items.map(item=>item.str).join(' '));
      if(n<=2){const viewport=page.getViewport({scale:1.5}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;images.push(canvas.toDataURL('image/png'));}
    }
    return structuredPage(file.name,lines.join('\n'),images);
  }
  async function parseDocx(file){
    await loadScript('vendor/mammoth.browser.min.js',()=>window.mammoth);
    const result=await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()}),page=structuredPage(file.name,result.value,[]);return page;
  }
  function sourceHtml(page){
    if(!page?.sourceFile)return '';
    const file=page.sourceFile,isPdf=/^application\/pdf$|\.pdf$/i.test(file.type||file.name);
    return isPdf&&(file.data||file.url)?`<div class="pdf-source-pages" data-pdf-source><p>正在按原始 PDF 版式加载产品单页……</p></div>`:window.productPageHtml(state.selected,false,page);
  }
  async function renderPdfSource(){
    const page=db()[state.selected],file=page?.sourceFile;if(!file||!/^application\/pdf$|\.pdf$/i.test(file.type||file.name)||!(file.data||file.url))return;
    try{
      await loadScript('vendor/pdf.min.js',()=>window.pdfjsLib);window.pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js';
      const bytes=file.data?Uint8Array.from(atob(file.data.split(',')[1]),c=>c.charCodeAt(0)):new Uint8Array(await (await fetch(file.url)).arrayBuffer());
      const pdf=await window.pdfjsLib.getDocument({data:bytes}).promise,host=root.querySelector('[data-pdf-source]');if(!host)return;host.innerHTML='';
      for(let n=1;n<=pdf.numPages;n++){const pdfPage=await pdf.getPage(n),viewport=pdfPage.getViewport({scale:1.35}),canvas=document.createElement('canvas');canvas.className='pdf-source-page';canvas.width=viewport.width;canvas.height=viewport.height;host.appendChild(canvas);await pdfPage.render({canvasContext:canvas.getContext('2d'),viewport}).promise;}
    }catch(error){const host=root.querySelector('[data-pdf-source]');if(host)host.innerHTML=`<p class="pdf-error">原始 PDF 加载失败：${esc(error.message)}</p>`;}
  }
  function exportWord(){
    const page=normalize(db()[state.selected]);
    const html='<!doctype html><html><head><meta charset="utf-8"><title>'+esc(pageTitle(page))+'</title><style>body{font-family:Arial,"Microsoft YaHei",sans-serif;margin:24px}.sheet{width:680px;margin:auto}.sheet table{border-collapse:collapse;width:100%}.sheet td,.sheet th{border:1px solid #222;padding:6px}.sheet .bar{background:#86add8;padding:7px}.sheet img{max-width:100%;max-height:360px;object-fit:contain}</style></head><body><div class="sheet">'+window.productPageHtml(state.selected,false,page)+'</div></body></html>';
    downloadBlob(new Blob([html],{type:'application/msword'}),pageTitle(page)+'.doc');
  }
  function exportPdf(){
    const page=normalize(db()[state.selected]);
    const printWindow=window.open('','_blank','noopener,noreferrer');
    if(!printWindow){message('浏览器阻止了新窗口，请允许弹出窗口后再导出 PDF。');return;}
    printWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(pageTitle(page))+'</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,"Microsoft YaHei",sans-serif}.sheet{width:680px;margin:auto}.sheet table{border-collapse:collapse;width:100%}.sheet td,.sheet th{border:1px solid #222;padding:6px}.sheet .bar{background:#86add8;padding:7px}.sheet img{max-width:100%;max-height:360px;object-fit:contain}</style></head><body><div class="sheet">'+window.productPageHtml(state.selected,false,page)+'</div><script>window.onload=function(){setTimeout(function(){window.print()},150)}<\/script></body></html>');
    printWindow.document.close();
  }
  function leave() {
    if(state.pending){message('图片正在读取，请稍候。');return false;}
    if(state.dirty&&!confirm('放弃当前未保存的产品单页修改？'))return false;
    state.draft=null;state.dirty=false;return true;
  }
  function open() {
    if(state.active)return;
    const editor=document.getElementById('data-editor');
    if(editor?.open){window.workbench.notice('请先保存或取消当前项目编辑。');return;}
    document.getElementById('history-dialog')?.close();
    document.body.classList.remove('database-module-mode','database-editor-mode');
    if(!root){root=document.createElement('section');root.id='product-page-library';root.setAttribute('aria-label','产品单页数据库工作区');document.getElementById('workflow').before(root);}
    state.hidden=[];state.scroll=window.scrollY;
    // Like the material database, replace the workspace; keep the top-level navigation.
    for(const el of [document.getElementById('workflow'),document.getElementById('viewport').closest('main')]){
      state.hidden.push([el,el.hidden]);el.hidden=true;
    }
    state.active=true;root.hidden=false;document.body.classList.add('page-library-active');
    document.querySelector('[data-product-page-database]').classList.add('active');
    document.querySelector('[data-database-shortcut]').classList.remove('active');
    render();window.scrollTo(0,0);
  }
  function close() {
    if(!leave())return false;
    root.hidden=true;state.active=false;document.body.classList.remove('page-library-active');
    for(const [el,hidden] of state.hidden)el.hidden=hidden;
    state.hidden=[];document.querySelector('[data-product-page-database]').classList.remove('active');
    document.querySelector('[data-database-shortcut]').classList.toggle('active',window.workbench.step===4);
    window.scrollTo(0,state.scroll);return true;
  }
  function render(status='') {
    const codes=Object.keys(db());
    if(!own(db(),state.selected))state.selected=codes[0]||'';
    state.selectedMany=state.selectedMany.filter(code=>own(db(),code));
    if(!state.selectedMany.length&&state.selected)state.selectedMany=[state.selected];
    root.innerHTML=`<div class="tools"><h1>产品单页数据库</h1><button data-action="back">返回项目</button></div>
      <p class="source-note">全局产品单页库 · ${codes.length} 个单页 · 新增和修改保存在数据库中</p>
      <div class="library-actions"><button data-action="add">新增产品单页</button><button data-action="edit" ${codes.length?'':'disabled'}>编辑当前单页</button><button data-action="delete" ${codes.length?'':'disabled'}>删除选中单页</button><button data-action="export-word" ${codes.length?'':'disabled'}>导出当前单页 Word</button><button data-action="export-pdf" ${codes.length?'':'disabled'}>导出当前单页 PDF</button><label class="library-import">导入产品单页 <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple data-library-import></label></div>
      <p data-library-status role="status">${esc(status)}</p>
      <div class="library-viewport" tabindex="0"><article class="document product-sheet">
      ${codes.length?`<div class="page-switcher"><label>选择产品单页 <select data-library-select multiple size="1" aria-label="选择产品单页（可多选删除）">${codes.map(code=>`<option value="${esc(code)}" ${state.selectedMany.includes(code)?'selected':''}>${esc(displayLabel(code))}</option>`).join('')}</select></label><button data-action="edit">编辑当前单页</button></div><div class="library-page-preview">${db()[state.selected].sourceFile?sourceHtml(db()[state.selected]):window.productPageHtml(state.selected,false,normalize(db()[state.selected]))}</div>`:'<div class="empty"><h2>暂无产品单页</h2><p>可批量导入 PDF、DOC 或 DOCX 产品单页，或手工新增。</p></div>'}
      </article></div>`;
    root.querySelector('[data-library-select]')?.addEventListener('change',e=>{
      state.selectedMany=[...e.target.selectedOptions].map(option=>option.value);
      state.selected=state.selectedMany[0]||state.selected;
      const preview=root.querySelector('.library-page-preview');
      if(preview&&own(db(),state.selected)){
        const page=db()[state.selected];
        preview.innerHTML=page.sourceFile?sourceHtml(page):window.productPageHtml(state.selected,false,normalize(page));
        if(page.sourceFile)void renderPdfSource();
      }
    });
    root.querySelector('[data-library-import]').onchange=importFiles;
    root.onclick=e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action==='back')close();if(action==='add')edit(true);if(action==='edit')edit(false);if(action==='delete'){const selected=state.selectedMany.filter(code=>own(db(),code));if(!selected.length){message('请先在下拉选择器中选择要删除的单页。');return;}if(confirm(`确定删除选中的 ${selected.length} 个产品单页吗？删除后无法从本机数据库恢复，请先导出备份。`)){const next={...db()};selected.forEach(code=>delete next[code]);persist(next);state.selected='';state.selectedMany=[];render(`已删除 ${selected.length} 个产品单页。`);}}if(action==='export-word')exportWord();if(action==='export-pdf')exportPdf();};
    root.oninput=null;root.onchange=null;root.onsubmit=null;
    if(codes.length&&db()[state.selected].sourceFile)void renderPdfSource();
  }
  const field=(label,key,value,area=false)=>`<label>${esc(label)}${area?`<textarea data-field="${key}">${esc(value)}</textarea>`:`<input data-field="${key}" value="${esc(value)}">`}</label>`;
  function edit(isNew) {
    state.original=isNew?'':state.selected;
    state.draft=isNew?blank():normalize(db()[state.selected]);state.dirty=false;
    drawEditor(isNew?'':state.selected);
  }
  function drawEditor(code) {
    const page=state.draft;
    root.innerHTML=`<div class="tools"><h1>产品单页数据库 / ${state.original?'编辑':'新增'}产品单页</h1><button data-action="cancel">返回单页管理</button></div>
      <p class="source-note">保存后返回数据库中的当前单页。</p><form class="library-editor">
      <div class="field-grid">${field('产品型号（数据库索引）','code',code)}${field('产品名称 / 系列','name',page.name)}${field('品牌','brand',page.brand)}</div>
      ${[['brandImage','品牌 Logo'],['photo','产品照片'],['drawing','尺寸 / CAD 图'],['qrImage','二维码'],['footerImage','页脚图片']].map(([key,label])=>`<div class="image-field"><label>${label}<input type="file" accept="image/png,image/jpeg,image/webp" data-image="${key}"></label>${page[key]?`<img src="${esc(page[key])}" alt="${label}" class="library-thumb">`:'<small>未上传图片</small>'}<button type="button" data-clear="${key}">清除图片</button></div>`).join('')}
      <h2>订货信息</h2><div class="edit-table-wrap"><table class="edit-table"><thead><tr><th>产品型号</th><th>产品描述</th><th>表面处理</th><th>单位</th><th>操作</th></tr></thead><tbody>${page.variants.map((row,i)=>`<tr>${row.map((value,j)=>`<td><textarea aria-label="第${i+1}行${['产品型号','产品描述','表面处理','单位'][j]}" data-row="${i}" data-col="${j}">${esc(value)}</textarea></td>`).join('')}<td><button type="button" data-remove="${i}">删除行</button></td></tr>`).join('')}</tbody></table></div>
      <button type="button" data-action="variant">添加订货型号</button><div class="field-grid">${field('产品特性（每行一条）','features',page.features.join('\n'),true)}${field('中文页脚','footerCn',page.footerBlocks?.cn||'',true)}${field('英文页脚','footerEn',page.footerBlocks?.en||'',true)}</div>
      <p data-library-status role="status"></p><footer class="library-editor-actions"><button type="button" data-action="cancel">取消</button><button type="submit" class="save-button">保存到产品单页数据库</button></footer></form>`;
    root.oninput=e=>{
      const el=e.target;
      if(el.dataset.field){const key=el.dataset.field;if(key==='features')page.features=el.value.split(/\r?\n/);else if(key==='footerCn'||key==='footerEn'){page.footerBlocks??={};page.footerBlocks[key==='footerCn'?'cn':'en']=el.value;}else if(key!=='code')page[key]=el.value;}
      if(el.dataset.row!==undefined)page.variants[Number(el.dataset.row)][Number(el.dataset.col)]=el.value;
      state.dirty=true;
    };
    root.onclick=e=>{
      const button=e.target.closest('button');if(!button)return;
      const code=root.querySelector('[data-field="code"]').value;
      if(button.dataset.action==='cancel'){if(leave())render();return;}
      if(state.pending)return;
      if(button.dataset.action==='variant'){page.variants.push(['','','','']);state.dirty=true;drawEditor(code);}
      if(button.dataset.remove!==undefined){page.variants.splice(Number(button.dataset.remove),1);state.dirty=true;drawEditor(code);}
      if(button.dataset.clear){page[button.dataset.clear]=null;state.dirty=true;drawEditor(code);}
    };
    root.onchange=async e=>{
      const key=e.target.dataset.image,file=e.target.files?.[0];if(!key||!file)return;
      if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>1024*1024){message('请选择不超过 1MB 的 PNG、JPEG 或 WebP 图片。');return;}
      state.pending++;
      try{page[key]=await uploadImage(file);state.dirty=true;drawEditor(root.querySelector('[data-field="code"]').value);}catch(error){message(error.message);}finally{state.pending--;}
    };
    root.onsubmit=e=>{
      e.preventDefault();if(state.pending){message('图片正在读取，请稍候。');return;}
      const code=root.querySelector('[data-field="code"]').value.trim();
      if(!code||['__proto__','constructor','prototype'].includes(code)){message('请输入有效的产品型号。');return;}
      if(code!==state.original&&own(db(),code)){message('该产品型号已存在，请选择其他型号。');return;}
      try{const next={...db()};if(state.original&&state.original!==code)delete next[state.original];next[code]=clone(page);persist(next);state.selected=code;state.draft=null;state.dirty=false;render('已保存到产品单页数据库。');}catch(error){message('保存失败，草稿已保留：'+error.message);}
    };
  }
  async function importFiles(e){
    const files=[...e.target.files];if(!files.length)return;
    try{
      const imported={};
      for(const file of files){
        if(!/\.(pdf|docx?)$/i.test(file.name))throw Error(file.name+'：仅支持 PDF、DOC 或 DOCX');
        const code=(file.name.replace(/\.(pdf|docx?)$/i,'').replace(/[^\w\-一-龥 ]+/g,'-').trim()||'产品单页').slice(0,80);
        const sameFile=Object.entries(db()).find(([,page])=>page?.sourceFile?.name===file.name)?.[0]||Object.entries(imported).find(([,page])=>page?.sourceFile?.name===file.name)?.[0];
        let key=sameFile||code,n=2;while(!sameFile&&(own(db(),key)||own(imported,key)))key=code+'-'+n++;
        if(/\.pdf$/i.test(file.name))imported[key]=await parsePdf(file);
        else if(/\.docx$/i.test(file.name))imported[key]=await parseDocx(file);
        else throw Error(file.name+'：旧版 DOC 无法在浏览器中直接解析，请转换为 DOCX 后导入');
        imported[key].sourceFile=await uploadDocument(file);
      }
      const count=Object.keys(imported).filter(code=>own(db(),code)).length;
      if(count&&!confirm(`有 ${count} 个同型号单页，是否替换？`))return;
      persist({...db(),...imported});render('已导入 '+Object.keys(imported).length+' 个产品单页。');
    }catch(error){message('导入失败：'+error.message);}finally{e.target.value='';}
  }
  // Navigation switches workspace before the existing button handler runs.
  document.addEventListener('click',e=>{
    if(!state.active)return;
    const button=e.target.closest('#project-hub button');
    if(button&&!button.hasAttribute('data-product-page-database')&&!close()){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
  window.productPageLibrary={open,close};
})();
