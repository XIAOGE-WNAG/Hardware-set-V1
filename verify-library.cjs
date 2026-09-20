const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const http=require('node:http');
const current=fs.readFileSync('index.html','utf8');
const before=fs.readFileSync('index.html.before-independent-module.bak','utf8');
let count=0;
for(const match of current.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
  if(match[1].trim()){new vm.Script(match[1]);count++;}
}
new vm.Script(fs.readFileSync('product-page-library.js','utf8'));
console.log('Syntax checked:',count,'inline script(s) plus library');
// The existing material database and workbench implementation must stay byte-identical.
const prefix=s=>s.slice(0,s.indexOf('/* ===== editor.js ===== */')).replace(/<link rel="stylesheet" href="product-page-library.css\?v=2">\r?\n/,'').replace(/<script defer src="product-page-library.js\?v=2"><\/script>\r?\n/,'').replace(/\r\n/g,'\n');
assert.equal(prefix(current),prefix(before));
const shortcut=s=>s.split(/\r?\n/).find(l=>l.includes("[data-database-shortcut]').onclick"));
assert.equal(shortcut(current),shortcut(before));
console.log('PASS: existing material database + workbench code and shortcut unchanged');
const library=fs.readFileSync('product-page-library.js','utf8');
assert(!/\b(caseData|projectStore)\s*[.\[]/.test(library.replace(/\/\*[\s\S]*?\*\//g,'')));
assert(!/showModal\(|workbench\.go\(/.test(library));
assert(!current.includes('const openDbPage=code=>'));
console.log('PASS: library has no project writes, workflow redirects or modal implementation');
http.get('http://127.0.0.1:8000/',res=>{let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>{assert.equal(res.statusCode,200);assert.equal(body,current);console.log('PASS: port 8000 serves edited workspace index.html');});}).on('error',error=>{throw error;});
