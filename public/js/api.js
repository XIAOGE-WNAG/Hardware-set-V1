(() => {
  const key='hw_token', tokenStore=sessionStorage;
  window.addEventListener('pagehide',()=>localStorage.removeItem(key));
  async function request(url,options={}) {
    const isForm=options.body instanceof FormData, headers={...(isForm?{}:{'Content-Type':'application/json'}),...(options.headers||{})}, token=tokenStore.getItem(key);
    if(token)headers.Authorization='Bearer '+token;
    let reqBody=options.body;if(!isForm&&reqBody&&typeof reqBody!=='string')reqBody=JSON.stringify(reqBody);
    const response=await fetch(url,{...options,headers,body:reqBody});let body;
    try{body=await response.json()}catch{body={error:await response.text()}}
    if(response.status===401){tokenStore.removeItem(key);window.dispatchEvent(new CustomEvent('hw-auth-expired'))}
    if(!response.ok)throw Error(body.error||'请求失败（'+response.status+'）');return body;
  }
  window.hwApi={request,login:async(username,password)=>{const result=await request('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})});tokenStore.setItem(key,result.data.token);localStorage.setItem(key,result.data.token);window.dispatchEvent(new CustomEvent('hw-auth-login',{detail:result.data}));return result.data},me:()=>request('/api/auth/me'),changePassword:password=>request('/api/auth/change-password',{method:'POST',body:JSON.stringify({password})}),tokenKey:key};
})();
