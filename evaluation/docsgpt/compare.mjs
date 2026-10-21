import fs from 'node:fs';
const agent=JSON.parse(fs.readFileSync('.private/docsgpt-agent.json'));
const output='evaluation/docsgpt/results/comparison.json';
const scenarios=[{id:'day-rest',questions:[
'2歳の子を育てています。最近疲れていて、昼間だけでも少し預けて休みたいです。仕事をしていなくても使える支援はありますか？',
'その一時預かりって、保育を受けることってなに？',
'仕事はしていないんだけど、休むために預けてもいいの？',
'料金はどうやって確認すればいい？',
'電話で何て言えばいい？相談文を作って。',
'ありがとう。まず聞いてみます。'
]},{id:'shortstay',questions:[
'子育てショートステイのお金のことを教えて。',
'それって全国どこでも同じ料金なの？',
'1泊2日で預けるなら、何のお金を確認すればいい？',
'資料に9210円とか4200円とあるけど、私が払うお金？',
'住んでいる市で明日使えるかも含めて、問い合わせる文を作って。',
'ありがとう。市に相談してみるね。'
]}];
const result={startedAt:new Date().toISOString(),model:'gemini-3.5-flash-lite',sources:12,scenarios:[]};
for(const s of scenarios){const run={id:s.id,turns:[]};result.scenarios.push(run);const messages=[];let cid;
for(const [i,question] of s.questions.entries()){
 const row={turn:i+1,question};
 for(const provider of i%2===0?['docsgpt','ruri']:['ruri','docsgpt']){
 const body=provider==='ruri'?{provider:'ruri',guided:false,messages:[...messages,{role:'user',content:question}]}:{question,api_key:agent.key,conversation_id:cid,model_id:result.model,visibility:'listed'};
 const started=performance.now();
 try{const r=await fetch(provider==='ruri'?'http://127.0.0.1:4317/api/chat':'http://127.0.0.1:7093/api/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});const data=await r.json();row[provider]={status:r.status,elapsedMs:Math.round(performance.now()-started),data};if(provider==='docsgpt')cid=data.conversation_id??cid;
 console.log(JSON.stringify({scenario:s.id,turn:i+1,provider,status:r.status,ms:row[provider].elapsedMs,reply:data.reply??data.answer,error:data.error}));
 if(!r.ok||data.error)throw new Error(`request failed ${provider}`);
 }catch(e){row[provider]??={error:e.message,elapsedMs:Math.round(performance.now()-started)};run.turns.push(row);fs.writeFileSync(output,JSON.stringify(result,null,2));throw e;}
 }
 messages.push({role:'user',content:question},{role:'assistant',content:row.ruri.data.reply});
 run.turns.push(row);fs.writeFileSync(output,JSON.stringify(result,null,2));
}}
