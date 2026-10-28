import fs from 'node:fs/promises';
const root=new URL('../../',import.meta.url),folder=new URL('.private/depth-compare-20261028/',root);
const rows=JSON.parse(await fs.readFile(new URL('public.json',folder),'utf8'));
const allowed=new Set(JSON.parse(await fs.readFile(new URL('data/source-manifest.json',root),'utf8')).sources.map(s=>s.url));
const urls=[...new Set(rows.flatMap(r=>r.replySources.map(s=>s.url)))];
if(urls.some(url=>!allowed.has(url)))throw Error('Unknown citation URL');
const links=await Promise.all(urls.map(async url=>{try{let r=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(20000)}),method='HEAD';if(r.status===405){method='GET';r=await fetch(url,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(20000)});await r.body?.cancel();}return{url,method,status:r.status,ok:r.ok};}catch(e){return{url,ok:false,error:e.name};}}));
await fs.writeFile(new URL('links.json',folder),JSON.stringify(links,null,2));console.log(JSON.stringify(links));
