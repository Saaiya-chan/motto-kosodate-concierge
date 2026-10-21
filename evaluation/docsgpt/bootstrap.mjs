import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const base='http://127.0.0.1:7093';
const root=process.cwd();
const out=path.join(root,'evaluation/docsgpt/results');
async function json(route,body){const r=await fetch(base+route,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const t=await r.text();if(!r.ok)throw new Error(`${route} ${r.status} ${t.slice(0,300)}`);return JSON.parse(t)}
const models=await json('/api/models');fs.writeFileSync(out+'/models.json',JSON.stringify(models,null,2));console.log('model catalog saved');
const manifest=JSON.parse(fs.readFileSync('data/source-manifest.json')).sources;
const form=new FormData();form.set('user','local');form.set('name','motto-12-official-documents-20261021');
const proof=[];
for(const s of manifest){const original='data/'+s.file;const upload=original.endsWith('.html')?original.replace(/\.html$/,'.txt'):original;const bytes=fs.readFileSync(upload);const sha=crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex');if(sha!==s.sha256)throw new Error('hash mismatch '+s.id);form.append('file',new Blob([bytes]),path.basename(upload));proof.push({id:s.id,title:s.title,url:s.url,originalSha256:sha,uploadedFile:upload,uploadSha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});}
fs.writeFileSync(out+'/corpus.json',JSON.stringify(proof,null,2));
const r=await fetch(base+'/api/upload',{method:'POST',headers:{'Idempotency-Key':'motto-eval-12-20261021-v1'},body:form});const upload=await r.json();fs.writeFileSync(out+'/upload.json',JSON.stringify(upload,null,2));console.log('upload',r.status,upload);
