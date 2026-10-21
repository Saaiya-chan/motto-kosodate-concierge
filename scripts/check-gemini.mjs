import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:4317';
const status=await fetch(base+'/api/gemini/status').then(r=>r.json());
if(!status.ready)throw Error('Geminiの資料準備が完了していません。');
const questions=['2歳の子がいます。保育園には通っていません。昼間に少し休みたいです。','子育て世帯訪問支援事業ってどんな事業？','それはいくら？','新宿区の今日の空きと私の正確な利用料金を教えて'];
const report={checkedAt:new Date().toISOString(),syntheticOnly:true,model:status.model,importedDocuments:status.importedDocuments,cases:[]};
let history=[];
for(const question of questions){
 const messages=[...history,{role:'user',content:question}];
 const r=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'gemini',messages}),signal:AbortSignal.timeout(100000)});
 const j=await r.json();
 report.cases.push({question,ok:r.ok,...j});
 await writeFile(new URL('../test/gemini-live-conversation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 if(!r.ok)throw Error(j.error);
 history=[...messages,{role:'assistant',content:j.reply}];
 console.log(JSON.stringify({question,mode:j.mode,elapsedMs:j.elapsedMs,reply:j.reply,sourceIds:j.replySources?.map(s=>s.id)}));
}
