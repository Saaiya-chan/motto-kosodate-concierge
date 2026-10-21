import fs from 'node:fs';import {validateCitationReview} from '../src/docsgpt-citations.mjs';
const questions=['2歳の子がいます。少し休むために、昼間だけ預けられる支援はありますか？','保育園にも幼稚園にも通っていません。仕事もしていません。どちらを相談するといい？','誰通は、毎日丸一日預けられるの？','一時預かりの料金や申し込み方は、何を確認すればいい？'];
const result={startedAt:new Date().toISOString(),turns:[]};let sessionId;const messages=[];
for(const [i,content]of questions.entries()){
 const req=[...messages,{role:'user',content}];const start=performance.now();const r=await fetch('http://127.0.0.1:4317/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'docsgpt',messages:req,sessionId}),signal:AbortSignal.timeout(100000)});const d=await r.json();
 const row={turn:i+1,question:content,status:r.status,elapsedMs:Math.round(performance.now()-start),data:d};result.turns.push(row);fs.writeFileSync('evaluation/docsgpt/results/daytime-candidates-fixed.json',JSON.stringify(result,null,2));if(!r.ok)throw Error(d.error);
 const verified=validateCitationReview({segments:d.citationReview.statements,corrections:d.citationReview.corrections},d.replySources,req);if(verified.reply!==d.reply)throw Error('Citation mismatch');
 if(i===0){if(!d.reply.includes('一時預かり')||!d.reply.includes('誰でも通園'))throw Error('Missing candidate');for(const id of ['temporary','daredemo'])if(!d.citationReview.statements.some(s=>s.kind==='fact'&&s.evidence.some(e=>{const doc=d.replySources.find(p=>p.id===e.sourceId);return doc?.programIds.includes(id)||doc?.excerpt.includes(id==='temporary'?'一時預かり':'誰でも通園');})))throw Error('Missing candidate evidence');}
 console.log(JSON.stringify({turn:i+1,ms:row.elapsedMs,reply:d.reply,sources:d.replySources.map(s=>s.title),timings:d.timings,partial:!!d.citationReview.partial}));sessionId=d.docsgptSessionId;messages.push({role:'user',content},{role:'assistant',content:d.reply});if(i<questions.length-1)await new Promise(r=>setTimeout(r,12000));
}
