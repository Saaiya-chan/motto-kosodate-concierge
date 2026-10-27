import fs from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const filename=process.env.AI_SEARCH_EVAL_FILE||'ai-search-comparison.json';
const data=JSON.parse(await fs.readFile(new URL('.private/'+filename,root),'utf8'));
const corpus=JSON.parse(await fs.readFile(new URL('.private/search-container-context/index.json',root),'utf8')).documents;
const normalize=s=>s.normalize('NFKC').replace(/^#{1,6}\s+/gm,'').replace(/\*\*/g,'').replace(/^\|?[-:|\s]+\|$/gm,'').replace(/\|/g,'').replace(/\s/g,'');
const rows=[];const urls=new Set();
for(const turn of data.turns.filter(t=>!t.error)){
 for(const source of turn.sources)urls.add(source.url);
 for(const statement of turn.review.statements){
  for(const evidence of statement.evidence){
   const source=turn.sources.find(s=>s.id===evidence.sourceId);
   const filename=source.id.split(':')[0];
   const originals=Object.values(corpus).filter(doc=>doc.metadata.filename===filename).map(doc=>doc.page_content);
   rows.push({provider:turn.provider,scenario:turn.scenario,turn:turn.turn,text:statement.text,quote:evidence.quote,source:source.title,url:source.url,
    originalTextMatch:originals.some(text=>normalize(text).includes(normalize(evidence.quote)))||normalize(originals.join('\n')).includes(normalize(evidence.quote))});
  }
 }
}
const links=[];
for(const url of urls){
 try{let response=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(30000)});if(response.status===405){response=await fetch(url,{signal:AbortSignal.timeout(30000)});await response.body?.cancel();}links.push({url,status:response.status,finalUrl:response.url,contentType:response.headers.get('content-type')});}
 catch(error){links.push({url,error:error.name});}
}
const audit={rows,links,warning:'Text presence and HTTP success do not prove semantic support; manually review each claim against its quote.'};
await fs.writeFile(new URL('.private/'+filename.replace('.json','-audit.json'),root),JSON.stringify(audit,null,2));
console.log(JSON.stringify({citations:rows.length,originalTextMissing:rows.filter(row=>!row.originalTextMatch).map(r=>({provider:r.provider,scenario:r.scenario,turn:r.turn,source:r.source,quote:r.quote})),links:links.map(({status,contentType})=>({status,contentType}))},null,2));
