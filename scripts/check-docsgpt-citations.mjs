import fs from 'node:fs';
const normalize=s=>s.normalize('NFKC').replace(/^#{1,6}\s+/gm,'').replace(/\*\*/g,'').replace(/^\|?[-:|\s]+\|$/gm,'').replace(/\|/g,'').replace(/\s/g,'');
const scenarios=[{id:'child-shortstay',questions:[
'子育てショートステイのお金のことを教えて。',
'それって全国どこでも同じ料金なの？',
'資料に9,210円や4,200円とあるけど、私が払うお金なの？',
'1泊2日で預けるなら、何のお金を確認すればいい？',
'明日から使えるかと、1泊2日の総額や食費・減免も確認したい。電話で伝える文を作って。',
'ありがとう。まず市に電話してみるね。'
]},{id:'daycare-and-comparison',questions:[
'2歳の子がいて仕事はしていません。休むために昼間だけ預けたいのですが、一時預かりは使えますか？',
'保育を受けることって、どういう意味？',
'一時預かりの料金は、誰がどのように決めているの？',
'具体的な金額が資料にないとき、窓口には何を確認したらいい？',
'子育てショートステイと、産後ケアのショートステイは同じ制度なの？',
'今回は一時預かりについて相談したいです。仕事をしていなくても休むために使えるか、料金と申し込み方も含めて、窓口に伝える文を作って。'
]}];
const out=process.env.RESULT_PATH||'evaluation/docsgpt/results/citations-fixed.json';const dayOnly=process.argv.includes('--day-only');const result=dayOnly?JSON.parse(fs.readFileSync(out)):{startedAt:new Date().toISOString(),scenarios:[]};if(dayOnly){result.scenarios=result.scenarios.filter(s=>s.id!=='daycare-and-comparison');result.daycareRetestedAt=new Date().toISOString();}
for(const scenario of scenarios.filter(s=>!dayOnly||s.id==='daycare-and-comparison')){const run={id:scenario.id,turns:[]};result.scenarios.push(run);let sessionId;const messages=[];
for(const [i,question] of scenario.questions.entries()){
 const begin=performance.now();const r=await fetch('http://127.0.0.1:4317/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'docsgpt',sessionId,messages:[...messages,{role:'user',content:question}]}),signal:AbortSignal.timeout(100000)});const data=await r.json();
 const row={turn:i+1,question,status:r.status,elapsedMs:Math.round(performance.now()-begin),data};run.turns.push(row);
 if(r.ok){const numbers=[...data.reply.matchAll(/\[(\d+)\]/g)].map(m=>+m[1]);const refs=data.replySources;const statements=data.citationReview?.statements||[];row.literalChecks={reviewed:data.citationReview?.checked===true,allLinksResolve:numbers.every(n=>refs.some(s=>s.citationNumber===n&&s.fullText&&s.url?.startsWith('https://'))),allQuotesPresent:statements.every(s=>s.evidence.every(e=>refs.some(d=>d.id===e.sourceId&&normalize(d.excerpt).includes(normalize(e.quote))))),factsHaveEvidence:statements.every(s=>s.kind!=='fact'||s.evidence.length>0)};sessionId=data.docsgptSessionId;messages.push({role:'user',content:question},{role:'assistant',content:data.reply});}
 fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({scenario:scenario.id,turn:i+1,status:r.status,ms:row.elapsedMs,timings:data.timings,attempts:data.citationReview?.attempts?.length,reply:data.reply,sources:data.replySources?.map(s=>s.title),corrections:data.citationReview?.corrections,checks:row.literalChecks,error:data.error}));
 if(!r.ok||Object.values(row.literalChecks).some(v=>!v))throw Error('Live validation failed. Results preserved.');
 await new Promise(resolve=>setTimeout(resolve,18000));
}}
