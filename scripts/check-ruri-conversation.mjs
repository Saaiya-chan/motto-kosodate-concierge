import {readFile,writeFile} from 'node:fs/promises';
const {messages}=JSON.parse(await readFile(new URL('../test/ruri-followup-before.json',import.meta.url)));
const cases=[
 {id:'reported-followup',messages,check:d=>d.mode==='ruri-gemini'&&d.replyStatements?.length>0&&/世話|お世話|預か/.test(d.reply)&&!d.reply.includes('確認できません')},
 {id:'missing-budget',messages:[{role:'user',content:'子育て世帯訪問支援事業の令和9年度の予算額を教えて'}],check:d=>d.replyBody?.includes('予算額')&&d.replySources.length===0&&d.replyGuidance?.length>0},
 {id:'thanks',messages:[...messages.slice(0,-1),{role:'user',content:'ありがとう！'}],check:d=>d.mode==='conversation'&&/どういたしまして/.test(d.reply)&&d.timings.googleMs===0}
];
const results=[];
for(const c of cases){const r=await fetch('http://127.0.0.1:4317/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'ruri',messages:c.messages})});const data=await r.json();const pass=r.ok&&c.check(data);results.push({id:c.id,input:c.messages,status:r.status,pass,data});console.log(JSON.stringify({id:c.id,status:r.status,pass,reply:data.reply,error:data.error}));if(data.quota)break;}
await writeFile(new URL('../test/ruri-conversation-live.json',import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),results},null,2)+'\n');
if(results.length!==cases.length||results.some(r=>!r.pass))process.exitCode=1;
