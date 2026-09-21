(() => {
  // sessionStorage survives page refreshes but is cleared when the browser session ends.
  // Keep authentication tokens out of localStorage so a closed browser cannot reopen a session.
  const key='hw_token', tokenStore=sessionStorage;
  // Older inline modules still read the token through localStorage. Bridge only that
  // key to the session store while keeping all application data in localStorage.
  const storageGet=Storage.prototype.getItem;
  const storageSet=Storage.prototype.setItem;
  const storageRemove=Storage.prototype.removeItem;
  const storageClear=Storage.prototype.clear;
  Storage.prototype.setItem=function(name,value){if(this===localStorage&&name===key)return tokenStore.setItem(key,value);return storageSet.call(this,name,value)};
  Storage.prototype.getItem=function(name){return this===localStorage&&name===key?tokenStore.getItem(key):storageGet.call(this,name)};
  Storage.prototype.removeItem=function(name){if(this===localStorage&&name===key)return tokenStore.removeItem(key);return storageRemove.call(this,name)};
  Storage.prototype.clear=function(){if(this===localStorage){for(let i=localStorage.length-1;i>=0;i--){const name=localStorage.key(i);if(name!==key)storageRemove.call(localStorage,name);}return}return storageClear.call(this)};
  async function request(url,options={}) {
    const isForm=options.body instanceof FormData, headers={...(isForm?{}:{'Content-Type':'application/json'}),...(options.headers||{})}, token=tokenStore.getItem(key);
    if(token)headers.Authorization='Bearer '+token;
    let reqBody=options.body;if(!isForm&&reqBody&&typeof reqBody!=='string')reqBody=JSON.stringify(reqBody);
    const response=await fetch(url,{...options,headers,body:reqBody});
    const raw=await response.text();
    let body;try{body=raw?JSON.parse(raw):{}}catch{body={error:raw||'服务器返回了无法解析的响应'}}
    if(response.status===401){tokenStore.removeItem(key);window.dispatchEvent(new CustomEvent('hw-auth-expired'))}
    if(!response.ok)throw Error(body.error||'请求失败（'+response.status+'）');return body;
  }
  window.hwApi={request,login:async(username,password)=>{const result=await request('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})});tokenStore.setItem(key,result.data.token);window.dispatchEvent(new CustomEvent('hw-auth-login',{detail:result.data}));return result.data},me:async()=>{const result=await request('/api/auth/me');window.dispatchEvent(new CustomEvent('hw-auth-validated'));return result},changePassword:password=>request('/api/auth/change-password',{method:'POST',body:JSON.stringify({password})}),tokenKey:key};
})();
