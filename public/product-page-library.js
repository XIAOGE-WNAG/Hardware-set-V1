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
    // 在现有引用上原地替换内容（saveProductPageDb 只换引用，不能先换再清空同一份对象，否则数据被删空）
    const target=db();
    for(const key of Object.keys(target)) delete target[key];
    Object.assign(target, next);
    window.saveProductPageDb(target);
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
    const visual=images?.[0]||{};
    return normalize({name,brand:'GMT',photo:visual.photo||null,drawing:visual.drawing||null,variants,features:lines.slice(0,60),sourceFile:{name:fileName,type:'application/octet-stream'}});
  }
  function cropCanvas(canvas,x,y,w,h){const crop=document.createElement('canvas');crop.width=Math.max(1,Math.round(w));crop.height=Math.max(1,Math.round(h));crop.getContext('2d').drawImage(canvas,x,y,w,h,0,0,crop.width,crop.height);return crop.toDataURL('image/png');}
  async function parsePdf(file){
    await loadScript('vendor/pdf.min.js',()=>window.pdfjsLib);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js';
    const pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,lines=[],images=[];
    for(let n=1;n<=pdf.numPages;n++){
      const page=await pdf.getPage(n),content=await page.getTextContent();lines.push(content.items.map(item=>item.str).join(' '));
      if(n===1){const viewport=page.getViewport({scale:1.5}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const imageTitle=content.items.find(item=>/产品图片|Product\s*Image/i.test(item.str)),orderTitle=content.items.find(item=>/订货信息|Order/i.test(item.str));if(imageTitle&&orderTitle){const top=Math.max(0,viewport.height-(imageTitle.transform?.[5]||viewport.height/2)*1.5-24),bottom=Math.min(viewport.height,viewport.height-(orderTitle.transform?.[5]||viewport.height/3)*1.5+18),height=Math.max(80,bottom-top);images.push({photo:cropCanvas(canvas,0,top,viewport.width/2,height),drawing:cropCanvas(canvas,viewport.width/2,top,viewport.width/2,height)});} }
    }
    return structuredPage(file.name,lines.join('\n'),images);
  }
  async function parseDocx(file){
    await loadScript('vendor/mammoth.browser.min.js',()=>window.mammoth);
    const arrayBuffer=await file.arrayBuffer(),result=await window.mammoth.extractRawText({arrayBuffer}),html=await window.mammoth.convertToHtml({arrayBuffer}),images=[...html.value.matchAll(/<img[^>]+src=["'](data:image\/[^"']+)["']/gi)].map(match=>match[1]);
    const page=structuredPage(file.name,result.value,images.length?[{photo:images[0]||null,drawing:images[1]||null}]:[]);return page;
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
  async function printCurrent(){
    if(!own(db(),state.selected)){message('请先选择一个产品单页。');return;}
    const page=normalize(db()[state.selected]);
    // 完整产品单页打印样式（与屏幕一致），否则 iframe 内只认这些类
    const css='@page{size:A4 portrait;margin:0}'+
      'body{margin:0;font-family:Arial,"Microsoft YaHei",sans-serif;background:#fff}'+
      '.product-sheet{width:210mm;height:297mm;box-sizing:border-box;padding:16mm 20mm 14mm;background:#fff;position:relative;margin:0 auto;display:flex;flex-direction:column;overflow:hidden}'+
      '.gmt{height:50px;margin:0 0 0 -18px;padding:0;font:bold 34px Georgia;color:#00a1d5;line-height:50px}'+
      '.gmt img.brand-image{height:34px;width:auto}'+
      '.product-frame{border:1px solid #111;box-sizing:border-box}'+
      '.product-frame .caption{padding:6px;font-family:SimSun,serif}'+
      '.blue-band{background:#86aedb;border-top:1px solid #111;border-bottom:1px solid #111;padding:6px;font-family:SimSun,serif}'+
      '.product-visuals{display:grid;grid-template-columns:41% 59%;height:75mm;overflow:hidden}'+
      '.product-visuals>div{position:relative;overflow:hidden}'+
      '.product-visuals>div+div{border-left:1px solid #111}'+
      '.product-visuals img{position:absolute;max-width:none}'+
      '.product-visuals .custom-visual img{position:static;width:100%;height:100%;object-fit:contain}'+
      '.order-table{font-size:13px;width:100%;border-collapse:collapse;table-layout:fixed}'+
      '.order-table th{background:#aac5e5;font-size:13px;border:1px solid #111;padding:4px}'+
      '.order-table td{height:31px;border:1px solid #111;padding:4px}'+
      '.features{padding:5px;min-height:30mm;font:12px/1.4 SimSun,serif;flex:1 1 auto;overflow:visible}'+
      '.product-footer{position:absolute;left:20mm;right:20mm;bottom:8mm;overflow:visible;min-height:14mm}'+
      '.product-footer-image{position:absolute;width:128mm;height:16mm;right:0;bottom:0;object-fit:fill}'+
      'img{max-width:100%}';
    // PDF 原页：直接渲染为图片打印，不走 HTML 重排，避免排版错误
    const file=page.sourceFile;
    const isPdf=file&&/^application\/pdf$|\.pdf$/i.test(file.type||file.name);
    let body='';
    if(isPdf&&(file.data||file.url)){
      try{
        await loadScript('vendor/pdf.min.js',()=>window.pdfjsLib);
        window.pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js';
        const bytes=file.data?Uint8Array.from(atob(file.data.split(',')[1]),c=>c.charCodeAt(0)):new Uint8Array(await (await fetch(file.url)).arrayBuffer());
        const pdf=await window.pdfjsLib.getDocument({data:bytes}).promise;
        let imgs='';
        for(let n=1;n<=pdf.numPages;n++){
          const pdfPage=await pdf.getPage(n);
          const viewport=pdfPage.getViewport({scale:2});
          const canvas=document.createElement('canvas');
          canvas.width=viewport.width;canvas.height=viewport.height;
          await pdfPage.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
          imgs+='<img class="pdf-print-page" src="'+canvas.toDataURL('image/png')+'">';
        }
        body=imgs;
      }catch(e){ body=window.productPageHtml(state.selected,false,page); message('PDF渲染失败，退回HTML排版：'+e.message); }
    }else{
      body=window.productPageHtml(state.selected,false,page);
    }
    const extraCss=isPdf?'@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}.pdf-print-page{display:block;width:210mm;height:297mm;object-fit:contain;margin:0;page-break-after:always}.pdf-print-page:last-child{page-break-after:auto}':'@page{size:A4 portrait;margin:0}';
    const html='<!doctype html><html><head><meta charset="utf-8"><title>'+esc(pageTitle(page))+'</title><style>'+extraCss+css+'</style></head><body>'+(isPdf?body:'<div class="product-sheet">'+body+'</div>')+'</body></html>';
    let frame=document.getElementById('__pdf_print_frame');
    if(!frame){frame=document.createElement('iframe');frame.id='__pdf_print_frame';frame.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';document.body.appendChild(frame);}
    const doc=frame.contentWindow.document;
    doc.open();doc.write(html);doc.close();
    frame.onload=()=>{setTimeout(()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch(e){message('打印失败：'+e.message);}},200);};
  }
  function exportPdf(){printCurrent();}
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
    for(const el of [document.getElementById('viewport').closest('main')]){
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
  function pruneOrphans() {
    // 清理历史遗留的空壳条目（早年按行号 0..N 误建），否则下拉里会出现大量无文件名的空选项。
    const target=db(); if(!target) return;
    let changed=false;
    for(const key of Object.keys(target)){
      const p=target[key]||{};
      const hasName=String(p.name||'').trim();
      const hasSku=String(p.skuCode||'').trim();
      const trimmedKey=String(key).trim();
      // 纯数字 key（0..N 行号残留）：真实 SKU/文件名均含字母，纯数字必为历史垃圾。
      // 无名称且无 SKU 一律删，无论是否带 sourceFile/图片。
      const isNumericKey=/^\d+$/.test(trimmedKey);
      const rowJunk=isNumericKey && !hasName && !hasSku;
      // 完全空壳：既无名称/SKU 又无任何内容/源文件
      const empty=!hasName && !hasSku && !p.sourceFile && !p.photo && !p.drawing && !(p.variants||[]).length && !(p.features||[]).length;
      if(rowJunk||empty){ delete target[key]; changed=true; }
    }
    // 真正删掉了就持久化，避免下次打开又从 localStorage 加载回来
    if(changed){ try{ const copy={...target}; window.saveProductPageDb(copy); window.hwBackendBridge?.syncPages(); }catch(e){} }
  }
  function render(status='') {
    pruneOrphans();
    const codes=Object.keys(db());
    if(!own(db(),state.selected))state.selected=codes[0]||'';
    state.selectedMany=state.selectedMany.filter(code=>own(db(),code));
    if(!state.selectedMany.length&&state.selected)state.selectedMany=[state.selected];
    root.innerHTML=`<div class="tools"><h1>产品单页数据库</h1><button data-action="back">返回项目</button></div>
      <p class="source-note">全局产品单页库 · ${codes.length} 个单页 · 新增和修改保存在数据库中</p>
      <div class="library-actions"><button data-action="add">新增产品单页</button><button data-action="edit" ${codes.length?'':'disabled'}>编辑当前单页</button><button data-action="delete" ${codes.length?'':'disabled'}>删除选中单页</button><button data-action="export-pdf" ${codes.length?'':'disabled'}>导出当前单页 PDF</button><label class="library-import">导入产品单页 <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple data-library-import></label></div>
      <p data-library-status role="status">${esc(status)}</p>
      ${codes.length?`<div class="page-switcher"><label>选择产品单页 <select data-library-select multiple size="1" aria-label="选择产品单页（可多选删除）">${codes.map(code=>`<option value="${esc(code)}" ${state.selectedMany.includes(code)?'selected':''}>${esc(displayLabel(code))}</option>`).join('')}</select></label><button data-action="edit">编辑当前单页</button></div>`:''}
      <div class="library-viewport" tabindex="0"><article class="document product-sheet">
      ${codes.length?`<div class="library-page-preview">${db()[state.selected].sourceFile?sourceHtml(db()[state.selected]):window.productPageHtml(state.selected,false,normalize(db()[state.selected]))}</div>`:'<div class="empty"><h2>暂无产品单页</h2><p>可批量导入 PDF、DOC 或 DOCX 产品单页，或手工新增。</p></div>'}
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
    root.onclick=e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action==='back')close();if(action==='add')edit(true);if(action==='edit')edit(false);if(action==='delete'){const selected=state.selectedMany.filter(code=>own(db(),code));if(!selected.length){message('请先在下拉选择器中选择要删除的单页。');return;}if(confirm(`确定删除选中的 ${selected.length} 个产品单页吗？删除后无法从本机数据库恢复，请先导出备份。`)){const next={...db()};selected.forEach(code=>delete next[code]);persist(next);state.selected='';state.selectedMany=[];render(`已删除 ${selected.length} 个产品单页。`);}}if(action==='export-pdf')exportPdf();};
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
      <div class="field-grid">${field('产品型号（数据库索引）','code',code)}${field('产品名称 / 系列','name',page.name)}${field('品牌','brand',page.brand)}${field('绑定 BOM 料号（sku_code，可选）','skuCode',page.skuCode||'')}</div>
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
      const entries=[];
      for(const file of files){
        if(!/\.(pdf|docx?)$/i.test(file.name))throw Error(file.name+'：仅支持 PDF、DOC 或 DOCX');
        const code=(file.name.replace(/\.(pdf|docx?)$/i,'').replace(/[^\w\-一-龥 ]+/g,'-').trim()||'产品单页').slice(0,80);
        const sameFile=Object.entries(db()).find(([,page])=>page?.sourceFile?.name===file.name)?.[0]||Object.entries(imported).find(([,page])=>page?.sourceFile?.name===file.name)?.[0];
        let key=sameFile||code,n=2;while(!sameFile&&(own(db(),key)||own(imported,key)))key=code+'-'+n++;
        entries.push({file,key});
      }
      // 并行上传（4 路）；PDF 走方案A直接存源文件，不再在浏览器里解析/裁图，避免 canvas 与二次传图
      let cursor=0;
      const worker=async()=>{
        while(cursor<entries.length){
          const {file,key}=entries[cursor++];
          let page;
          if(/\.pdf$/i.test(file.name)){page=blank();page.name=key;}
          else if(/\.docx?$/i.test(file.name)){page=await parseDocx(file);}
          else{throw Error(file.name+'：旧版 DOC 无法在浏览器中直接解析，请转换为 DOCX 后导入');}
          page.sourceFile=await uploadDocument(file);
          imported[key]=page;
        }
      };
      await Promise.all(Array.from({length:Math.min(4,entries.length)},worker));
      const count=Object.keys(imported).filter(code=>own(db(),code)).length;
      if(count&&!confirm(`有 ${count} 个同型号单页，是否替换？`))return;
      persist({...db(),...imported});render('已导入 '+Object.keys(imported).length+' 个产品单页。');
    }catch(error){message('导入失败：'+error.message);}finally{e.target.value='';}
  }
  // Navigation switches workspace before the existing button handler runs.
  document.addEventListener('click',e=>{
    if(!state.active)return;
    const button=e.target.closest('#project-hub button, nav#workflow button');
    if(button&&!button.hasAttribute('data-product-page-database')&&!close()){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
  window.productPageLibrary={open,close,printCurrent,isActive:()=>!!state.active};
})();
