(() => {
  const roles={admin:'系统管理员',company_admin:'公司管理员',editor:'编辑用户',viewer:'只读用户'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.openAccountTree=async()=>{
    if(document.querySelector('.account-tree'))return;
    const api=(p,o)=>window.hwApi.request('/api'+p,o);
    const dialog=document.createElement('dialog');dialog.className='account-tree';
    const style=document.createElement('style');
    style.textContent=`
    .account-tree{width:min(1080px,94vw);max-width:94vw;height: min(760px,90vh);padding:0;border:1px solid #dce2e9;border-radius:16px;color:#243447;font:14px/1.6 "Segoe UI","Microsoft YaHei",sans-serif;box-shadow:0 24px 80px #10263b40}
    .account-tree::backdrop{background:#152b4266;backdrop-filter:blur(3px)}
    .account-tree *{box-sizing:border-box}.account-tree header{padding:22px 28px;border-bottom:1px solid #e5eaf0;display:flex;justify-content:space-between;align-items:center}
    .account-tree h2,.account-tree h3{margin:0}.account-tree p{color:#6b7b8d}.account-tree small{display:block;color:#6b7b8d}
    .account-tree button{border:1px solid #d8e0e8;border-radius:7px;padding:8px 13px;background:#fff;color:#30485f;cursor:pointer;font:inherit}
    .account-tree button:hover{background:#edf4fc}.account-tree button:disabled{opacity:.5;cursor:wait}
    .account-tree .primary{background:#2469a5;color:white;border-color:#2469a5}.account-tree .danger{color:#b63737}
    .account-tree .layout{display:grid;grid-template-columns:280px 1fr;height:calc(100% - 112px)}
    .account-tree nav{display:block;padding:20px 14px;background:#f5f7fa;border-right:1px solid #e1e7ef;overflow:auto;min-width:0}
    .account-tree nav button{display:block;width:100%;text-align:left;border:0;background:transparent;margin:3px 0;flex:none}
    .account-tree nav button.selected{background:#dfecfa;color:#195b96;font-weight:600}
    .account-tree nav .member{padding-left:32px;font-size:13px}
    .account-tree main{display:block;min-width:0;padding:24px 30px;overflow:auto;background:#fff}.account-tree .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:20px 0}
    .account-tree label{display:block;font-size:13px}.account-tree input,.account-tree select{display:block;width:100%;padding:9px 10px;margin-top:5px;border:1px solid #ccd7e2;border-radius:6px;font:inherit;background:white}
    .account-tree .actions{display:flex;gap:10px;margin-top:20px}.account-tree .notice{color:#b63737;min-height:24px;padding:0 28px}
    .account-tree .row{display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid #e7ecf2;align-items:center}
    .account-tree .badge{font-size:12px;background:#edf3f9;border-radius:4px;padding:3px 8px}
    @media(max-width:700px){.account-tree .layout{grid-template-columns:1fr;height:auto}.account-tree nav{max-height:210px}.account-tree .grid{grid-template-columns:1fr}}
    `;
    dialog.append(style);
    dialog.insertAdjacentHTML('beforeend','<header><div><small>组织与访问权限</small><h2>用户管理</h2></div><button data-close aria-label="关闭">关闭</button></header><div class="notice" role="status" aria-live="polite"></div><div class="layout"><nav aria-label="组织树"></nav><main>正在加载账户…</main></div>');
    document.body.append(dialog);dialog.showModal();
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
    const nav=dialog.querySelector('nav'),main=dialog.querySelector('main'),notice=dialog.querySelector('.notice');
    let users=[],orgs=[],me,admin,selected='system',busy=false;
    const message=e=>notice.textContent=e.message||e;
    async function action(fn){if(busy)return;busy=true;notice.textContent='';try{await fn()}catch(e){message(e)}finally{busy=false}}
    function group(u){return u.role==='admin'?'system':u.organizationId||'unassigned'}
    async function load(){
      const results=await Promise.all([api('/auth/me'),api('/organizations'),api('/users')]);
      me=results[0].data;admin=me.role==='admin';orgs=results[1].data;users=results[2].data;
      if(!admin&&!orgs.some(o=>o.id===selected))selected=orgs[0]?.id||'unassigned';
      tree();showGroup();
    }
    function tree(){
      const groups=[...(admin?[{id:'system',name:'系统管理员'}]:[]),...orgs,...(admin?[{id:'unassigned',name:'待分配账户'}]:[])];
      nav.innerHTML=(admin?'<button data-new-org>＋ 新建公司组织</button>':'<small>仅显示所属组织</small>')+groups.map(g=>'<button data-group="'+esc(g.id)+'" class="'+(selected===g.id?'selected':'')+'">▾ '+esc(g.name)+' <span class="badge">'+users.filter(u=>group(u)===g.id).length+'</span></button>'+users.filter(u=>group(u)===g.id).map(u=>'<button class="member" data-user="'+u.id+'">'+esc(u.displayName||u.username)+'<small>'+esc(u.username)+' · '+roles[u.role]+'</small></button>').join('')).join('');
    }
    function showGroup(){
      const name=selected==='system'?'系统管理员':selected==='unassigned'?'待分配账户':orgs.find(o=>o.id===selected)?.name||'所属组织';
      main.innerHTML='<h3>'+esc(name)+'</h3><p>'+(admin?'选择账户编辑权限，或为当前组织新增账户。':'仅可修改本组织账户的用户名、显示名和密码。')+'</p>'+
        (admin?'<div class="actions"><button class="primary" data-create>＋ 新增账户</button>'+(orgs.some(o=>o.id===selected)?'<button class="danger" data-delete-org>删除空组织</button>':'')+'</div>':'')+
        users.filter(u=>group(u)===selected).map(u=>'<div class="row"><div>'+esc(u.username)+' <span class="badge">'+roles[u.role]+'</span><small>'+esc(u.status==='active'?'启用':u.status==='locked'?'锁定':'禁用')+'</small></div><button data-user="'+u.id+'">账户详情</button></div>').join('')+
        (!users.length?'<p>暂无可管理账户。未分配组织的账户需由系统管理员分配。</p>':'');
    }
    function edit(u){
      const fresh=!u;u=u||{role:selected==='system'?'admin':'viewer',organizationId:orgs.some(o=>o.id===selected)?selected:null,status:'active',sessionHours:168};
      const field=(name,title,value,type='text',extra='')=>'<label>'+title+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
      main.innerHTML='<h3>'+(fresh?'新增账户':'账户详情 · '+esc(u.username))+'</h3><small>公司管理员仅能维护账户基本资料和密码。</small><form><div class="grid">'+
        field('username','用户名',u.username||'','text','required maxlength="80" autocomplete="off"')+
        field('displayName','显示名',u.displayName||'')+
        field('password',fresh?'初始密码':'重置密码（留空不变）','','password','minlength="6" autocomplete="new-password" '+(fresh?'required':''))+
        (admin?'<label>角色<select name="role">'+Object.entries(roles).map(([k,v])=>'<option value="'+k+'" '+(u.role===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label><label>公司组织<select name="organizationId"><option value="">待分配 / 系统账户</option>'+orgs.map(o=>'<option value="'+esc(o.id)+'" '+(u.organizationId===o.id?'selected':'')+'>'+esc(o.name)+'</option>').join('')+'</select></label><label>状态<select name="status">'+[['active','启用'],['disabled','禁用'],['locked','锁定']].map(([k,v])=>'<option value="'+k+'" '+(u.status===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'+field('sessionHours','登录有效期（小时）',u.sessionHours,'number','min="1" max="8760" required')+field('accountDays','账户有效天数（0=永久，留空保持）',fresh?365:'','number','min="0" max="36500"'):'<label>角色<small>'+roles[u.role]+'</small></label>')+
        '</div><small>当前到期时间：'+esc(u.expiresAt?new Date(u.expiresAt).toLocaleString():'永久')+'</small><div class="actions"><button class="primary" type="submit">保存账户</button>'+
        (admin&&!fresh&&u.id!==1&&u.id!==me.id?'<button type="button" class="danger" data-delete-user>删除账户</button>':'')+'</div></form>';
      const form=main.querySelector('form');
      if(admin){const sync=()=>{const s=form.elements.organizationId;s.disabled=form.elements.role.value==='admin';};form.elements.role.onchange=sync;sync()}
      form.onsubmit=e=>{e.preventDefault();action(async()=>{
        const b=Object.fromEntries(new FormData(form));if(!b.password)delete b.password;
        if(admin){b.organizationId=b.role==='admin'?null:b.organizationId||null;b.sessionHours=Number(b.sessionHours);if(b.accountDays==='')delete b.accountDays;else b.accountDays=Number(b.accountDays)}
        await api('/users'+(fresh?'':'/'+u.id),{method:fresh?'POST':'PUT',body:b});await load();message('账户已保存。权限或密码变更后需重新登录。');
      })};
      main.querySelector('[data-delete-user]')?.addEventListener('click',()=>action(async()=>{
        if(!confirm('删除账户 '+u.username+'？账户将失去登录权限，业务记录保留。'))return;
        await api('/users/'+u.id,{method:'DELETE'});await load();message('账户已删除');
      }));
    }
    dialog.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.group){selected=b.dataset.group;tree();showGroup()}
      if(b.dataset.user){const u=users.find(x=>x.id===Number(b.dataset.user));if(u)edit(u)}
      if(b.hasAttribute('data-create')&&admin)edit();
      if(b.hasAttribute('data-new-org')&&admin){
        main.innerHTML='<h3>新建公司组织</h3><form><div class="grid"><label>公司名称<input name="name" required maxlength="100"></label></div><button class="primary">创建组织</button></form>';
        main.querySelector('form').onsubmit=e=>{e.preventDefault();const name=new FormData(e.target).get('name');action(async()=>{const r=await api('/organizations',{method:'POST',body:{name}});selected=r.data.id;await load()})};
      }
      if(b.hasAttribute('data-delete-org')&&admin)action(async()=>{if(!confirm('删除该空组织？'))return;await api('/organizations/'+selected,{method:'DELETE'});selected='system';await load()});
    });
    await action(load);
  };
})();
