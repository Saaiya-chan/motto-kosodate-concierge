// One synthetic generation only; verify page/assets remain available while it is pending.
import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
const root=new URL('../../',import.meta.url);
const {url}=JSON.parse(await fs.readFile(new URL('.private/cloud-run-web-deployment.json',root),'utf8'));
const post=body=>fetch(url+'/api/chat',{method:'POST',headers:{Origin:url,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(100000)});
const body={provider:'docsgpt',messages:[{role:'user',content:'子育てショートステイの料金は全国同じですか？'}]};
let chatFinished=false;
const started=performance.now();
const chat=post(body).then(async r=>({status:r.status,body:await r.json(),elapsedMs:Math.round(performance.now()-started)})).finally(()=>{chatFinished=true;});
await delay(1000);
const pendingAtBurst=!chatFinished;
const paths=['/','/app.js','/style.css','/input.js','/logging.js','/api/catalog','/api/sources','/api/health','/api/log-consent'];
const pages=await Promise.all(paths.map(async path=>{const start=performance.now();const r=await fetch(url+path,{signal:AbortSignal.timeout(30000)});await r.arrayBuffer();return{path,status:r.status,elapsedMs:Math.round(performance.now()-start),chatPendingOnCompletion:!chatFinished};}));
let second;
if(!chatFinished){const r=await post(body);second={status:r.status,body:await r.json()};}
const answer=await chat;
const result={measuredAt:new Date().toISOString(),syntheticOnly:true,loggingConsent:false,pendingAtBurst,pages,secondChat:second,chat:{status:answer.status,elapsedMs:answer.elapsedMs,hasReply:!!answer.body.reply,saved:answer.body.logging?.saved}};
await fs.writeFile(new URL('.private/cloud-run-concurrency-check.json',root),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(answer.status!==200||!pendingAtBurst||pages.some(p=>p.status!==200)||!pages.every(p=>p.chatPendingOnCompletion))throw Error('Concurrency success path not proven');
if(second&&(second.status!==429||!second.body.error?.includes('別の相談')))throw Error('Expected application busy protection');
