// Public HTTPS success path; synthetic questions only, no logging consent.
import fs from 'node:fs/promises';
const root=new URL('../../',import.meta.url),out=new URL('.private/depth-compare-20261028/',root);await fs.mkdir(out,{recursive:true,mode:0o700});
const questions=JSON.parse(await fs.readFile(new URL('questions-20261028.json',import.meta.url),'utf8'));
const base='https://motto-concierge-web-try-84762847191.asia-northeast1.run.app',history=[],results=[],failures=[];let sessionId;
const checks=[];
for(const [path,options,expected] of [
 ['/api/health',{},200],['/api/docsgpt/status',{},200],['/api/log-consent',{},200],['/api/admin/logs',{},401],
 ['/api/chat',{method:'POST',headers:{Origin:'https://unrelated.invalid','content-type':'application/json'},body:'{}'},403]
]){const r=await fetch(base+path,options);let value;try{value=await r.json();}catch{}checks.push({path,status:r.status,ok:r.status===expected,...(path==='/api/health'?{healthy:value?.ok}:{}),...(path==='/api/docsgpt/status'?{ready:value?.ready}:{}),...(path==='/api/log-consent'?{loggingEnabled:value?.enabled}:{})});}
await fs.writeFile(new URL('http-checks.json',out),JSON.stringify(checks,null,2));console.log('HTTP',JSON.stringify(checks));if(checks.some(c=>!c.ok)||checks.find(c=>c.path==='/api/log-consent').loggingEnabled!==false)throw Error('HTTP or consent safety check failed');
for(const q of questions){history.push({role:'user',content:q.question});let data,start,status;
 for(let attempt=0;attempt<2;attempt++){
  start=performance.now();const r=await fetch(base+'/api/chat',{method:'POST',headers:{Origin:base,'content-type':'application/json'},body:JSON.stringify({provider:'docsgpt',messages:history,sessionId}),signal:AbortSignal.timeout(120000)});status=r.status;data=await r.json();
  if(r.ok)break;failures.push({id:q.id,status,error:data.error,elapsedMs:Math.round(performance.now()-start)});await fs.writeFile(new URL('public-failures.json',out),JSON.stringify(failures,null,2));if(attempt===0&&/上限|混雑|再送|少し待|確認を完了/.test(data.error||'')){console.log(q.id,'retrying after30s',status);await new Promise(resolve=>setTimeout(resolve,30000));}else throw Error(q.id+': '+data.error);
 }
 if(status!==200)throw Error(q.id+': '+data.error);
 if(data.logging?.saved||data.model!=='gemini-3.5-flash-lite'||!data.citationReview?.checked)throw Error('Model, logging or citation verification mismatch');
 sessionId=data.docsgptSessionId;history.push({role:'assistant',content:data.reply});results.push({...q,...data,httpElapsedMs:Math.round(performance.now()-start)});
 await fs.writeFile(new URL('public.json',out),JSON.stringify(results,null,2),{mode:0o600});
 console.log(q.id,results.at(-1).httpElapsedMs,'partial='+!!data.citationReview.partial,'meaning='+!!data.citationReview.meaning?.checked);
 if(q!==questions.at(-1))await new Promise(resolve=>setTimeout(resolve,8000));
}
