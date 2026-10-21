import fs from 'node:fs';
const {key}=JSON.parse(fs.readFileSync('.private/docsgpt-agent.json'));
const file='evaluation/docsgpt/results/comparison.json';const result=JSON.parse(fs.readFileSync(file));const run=result.scenarios.find(s=>s.id==='shortstay');
const questions=['子育てショートステイのお金のことを教えて。','それって全国どこでも同じ料金なの？','1泊2日で預けるなら、何のお金を確認すればいい？','資料に9210円とか4200円とあるけど、私が払うお金？','住んでいる市で明日使えるかも含めて、問い合わせる文を作って。','ありがとう。市に相談してみるね。'];
let cid=run.turns.find(t=>t.docsgpt.status===200).docsgpt.data.conversation_id;const messages=[];
for(const [i,question]of questions.entries()){
 let row=run.turns[i]??{turn:i+1,question};
 for(const p of i%2===0?['docsgpt','ruri']:['ruri','docsgpt']){
 if(row[p]?.status===200){if(p==='docsgpt')cid=row[p].data.conversation_id;continue;}
 if(row[p]){row.attempts??=[];row.attempts.push({provider:p,...row[p]});}
 const st=performance.now();const r=await fetch(p==='docsgpt'?'http://127.0.0.1:7093/api/answer':'http://127.0.0.1:4317/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p==='docsgpt'?{question,api_key:key,conversation_id:cid,model_id:result.model,visibility:'listed'}:{provider:'ruri',guided:false,messages:[...messages,{role:'user',content:question}]}),signal:AbortSignal.timeout(180000)});const data=await r.json();row[p]={status:r.status,elapsedMs:Math.round(performance.now()-st),data};run.turns[i]=row;fs.writeFileSync(file,JSON.stringify(result,null,2));console.log(JSON.stringify({turn:i+1,p,status:r.status,ms:row[p].elapsedMs,reply:data.answer??data.reply,error:data.error}));if(!r.ok||data.error)throw Error('failed '+p);if(p==='docsgpt')cid=data.conversation_id;
 }
 messages.push({role:'user',content:question},{role:'assistant',content:row.ruri.data.reply});
 if(i>0&&i<5)await new Promise(r=>setTimeout(r,16000));
}
