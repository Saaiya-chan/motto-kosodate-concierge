import {readFile,writeFile} from 'node:fs/promises';
let failed=false;
for(const id of ['rest','home']){
 const before=JSON.parse(await readFile(new URL(`../test/consultation-qa-${id}.json`,import.meta.url)));
 const inputs=before.turns.map(t=>t.user);
 if(id==='rest')inputs.push('相談するときの文を作って','ありがとう。まず相談してみます。');
 const run={checkedAt:new Date().toISOString(),scenario:id,provider:'ruri',turns:[]};const messages=[];
 for(const [i,user]of inputs.entries()){
  const started=performance.now();const r=await fetch('http://127.0.0.1:4317/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'ruri',messages:[...messages,{role:'user',content:user}]}),signal:AbortSignal.timeout(100000)});const data=await r.json();
  let check=r.ok&&!data.groundingRejected;
  if(id==='rest'&&i===0)check&&=data.replySources?.length>0;
  if(id==='rest'&&[3,4,5,6].includes(i))check&&=data.replyGuidance?.length>0&&data.question===null&&!data.showRecommendations;
  if(id==='rest'&&i===6)check&&=data.reply.includes('一時預かり')&&!data.reply.includes('病児保育');
  if(id==='home'&&i===4)check&&=data.mode==='ruri-gemini'&&data.replySources?.length>0;
  if((id==='home'&&i===7)||(id==='rest'&&i===7))check&&=data.mode==='conversation'&&data.question===null&&!data.showRecommendations&&data.timings.googleMs===0;
  if(id==='home'&&i===6)check&&=data.mode==='source-limited'&&data.replyGuidance?.length>0;
  run.turns.push({user,status:r.status,elapsedMs:performance.now()-started,pass:Boolean(check),data});
  await writeFile(new URL(`../test/consultation-qa-${id}-fixed.json`,import.meta.url),JSON.stringify(run,null,2)+'\n');
  console.log(JSON.stringify({scenario:id,turn:i+1,pass:Boolean(check),status:r.status,user,reply:data.reply,mode:data.mode,sources:data.replySources?.map(s=>s.id),error:data.error}));
  if(!check)failed=true;
  if(!r.ok){if(data.quota)console.log(JSON.stringify({quota:data.quota}));process.exitCode=1;break;}
  messages.push({role:'user',content:user},{role:'assistant',content:data.reply});
 }
 if(run.turns.at(-1)?.status!==200)break;
}
if(failed)process.exitCode=1;
