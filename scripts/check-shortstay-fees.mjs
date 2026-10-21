import {writeFile} from 'node:fs/promises';
const inputs=['ショートステイのお金はどのくらいかかりますか？','子育てショートステイのことです。市町村が料金を決めるってこと？','1泊2日で使うとき、何のお金を確認すればいい？','相談するときの文を作って','ありがとう。まず相談してみます。'];
const messages=[],turns=[];
for(const [i,user]of inputs.entries()){
 const r=await fetch('http://127.0.0.1:4317/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'ruri',messages:[...messages,{role:'user',content:user}]}),signal:AbortSignal.timeout(100000)});const data=await r.json();
 let pass=r.ok&&!data.reply?.includes('トワイライト')&&!/補助基準|負担軽減加算|運営費/.test(data.replyBody||'');
 if(i===0)pass&&=data.replySources?.some(s=>s.id.startsWith('shortstay-faq-'))&&/市町村/.test(data.reply)&&data.replyGuidance?.length>0&&!/\d[\d,]*円/.test(data.reply);
 if(i===1)pass&&=data.replySources?.length>0;
 if(i===2)pass&&=/1泊2日.*総額/s.test(data.reply)&&/食費|送迎費/.test(data.reply);
 if(i===3)pass&&=data.mode==='conversation'&&data.reply.includes('子育てショートステイ');
 if(i===4)pass&&=data.mode==='conversation'&&data.question===null;
 turns.push({user,status:r.status,pass:Boolean(pass),data});console.log(JSON.stringify({turn:i+1,pass:Boolean(pass),status:r.status,reply:data.reply,sources:data.replySources?.map(s=>s.id),error:data.error}));
 await writeFile(new URL('../test/shortstay-fees-live.json',import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),turns},null,2)+'\n');
 if(!r.ok){process.exitCode=1;break;}messages.push({role:'user',content:user},{role:'assistant',content:data.reply});
}
if(turns.some(t=>!t.pass))process.exitCode=1;
