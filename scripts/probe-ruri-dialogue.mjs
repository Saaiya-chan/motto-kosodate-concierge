import {readFile,writeFile} from 'node:fs/promises';
const [id,text]=process.argv.slice(2);if(!/^[a-z-]+$/.test(id||'')||!text)throw Error('scenario id and user text required');
const path=new URL('../test/consultation-qa-'+id+'.json',import.meta.url);
let run;try{run=JSON.parse(await readFile(path));}catch{run={checkedAt:new Date().toISOString(),scenario:id,provider:'ruri',turns:[]};}
const messages=run.turns.filter(t=>t.status===200).flatMap(t=>[{role:'user',content:t.user},{role:'assistant',content:t.data.reply}]);messages.push({role:'user',content:text});
const started=performance.now();const response=await fetch('http://127.0.0.1:4317/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'ruri',messages}),signal:AbortSignal.timeout(100000)});const data=await response.json();
const turn={user:text,status:response.status,elapsedMs:performance.now()-started,data};run.turns.push(turn);await writeFile(path,JSON.stringify(run,null,2)+'\n');
console.log(JSON.stringify({turn:run.turns.length,user:text,status:response.status,reply:data.reply,question:data.question,programs:data.results?.map(p=>p.id),mode:data.mode,seconds:Math.round(turn.elapsedMs)/1000,sources:data.replySources?.map(s=>s.id),error:data.error,quota:data.quota},null,2));
