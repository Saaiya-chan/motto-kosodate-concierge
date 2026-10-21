import fs from 'node:fs';
import {validateCitationReview} from '../src/docsgpt-citations.mjs';
const root='evaluation/docsgpt/results/';
const runs=Object.fromEntries(['before','after'].map(label=>[label,JSON.parse(fs.readFileSync(root+`performance-${label}.json`))]));
const rows=[];const audit=[];
function percentile(values,p){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.ceil(p*sorted.length)-1];}
for(const [label,run]of Object.entries(runs)){
 for(const scenario of run.scenarios){const history=[];
  for(const t of scenario.turns){
   if(t.status!==200)throw Error(`HTTP failure ${label} ${scenario.id} ${t.turn}`);
   const d=t.data;const messages=[...history,{role:'user',content:t.question}];
   let validationError=null;try{const checked=validateCitationReview({segments:d.citationReview.statements,corrections:d.citationReview.corrections},d.replySources,messages);if(checked.reply!==d.reply)throw Error('Reply mismatch');}catch(e){validationError=e.message;if(label==='after')throw e;}
   if(!Object.values(t.literalChecks).every(Boolean))throw Error('Literal check failed');
   rows.push({validationError,label,scenario:scenario.id,turn:t.turn,question:t.question,elapsedMs:t.elapsedMs,...d.timings,attempts:d.citationReview.attempts?.length,partial:!!d.citationReview.partial,linkedFacts:d.citationReview.statements.filter(s=>s.kind==='fact').length});
   if(validationError)audit.push(`Final validator rejection: ${validationError}`);
   audit.push(`\n${label} / ${scenario.id} / ${t.turn}: ${t.elapsedMs}ms\nQ: ${t.question}\nA: ${d.reply}`);
   for(const s of d.citationReview.statements)for(const e of s.evidence){const doc=d.replySources.find(x=>x.id===e.sourceId);audit.push(`fact: ${s.text}\nsource: ${doc.title}\nURL: ${doc.url}\nquote: ${e.quote}`);}
   history.push({role:'user',content:t.question},{role:'assistant',content:d.reply});
  }
 }
}
const a=rows.filter(r=>r.label==='before'),b=rows.filter(r=>r.label==='after');if(a.length!==12||b.length!==12||a.some((r,i)=>r.question!==b[i].question))throw Error('Questions differ or comparison incomplete');
const summary={measuredAt:new Date().toISOString(),method:'Same 12 documents, same Gemini model, 2 independent six-turn conversations per condition. Sequential HTTP requests; 18-second pauses excluded. No answer cache. One run per question; no statistical confidence claim.',conditions:{}};
for(const [label,values]of [['before',a],['after',b]])summary.conditions[label]={n:values.length,meanMs:Math.round(values.reduce((n,r)=>n+r.elapsedMs,0)/values.length),medianMs:(percentile(values.map(r=>r.elapsedMs),.5)+[...values].sort((x,y)=>x.elapsedMs-y.elapsedMs)[6].elapsedMs)/2,p90Ms:percentile(values.map(r=>r.elapsedMs),.9),minMs:Math.min(...values.map(r=>r.elapsedMs)),maxMs:Math.max(...values.map(r=>r.elapsedMs)),meanUpstreamMs:Math.round(values.reduce((n,r)=>n+r.upstreamMs,0)/values.length),meanPassagesMs:Math.round(values.reduce((n,r)=>n+r.passagesMs,0)/values.length),meanReviewMs:Math.round(values.reduce((n,r)=>n+r.reviewMs,0)/values.length),reviewCalls:values.reduce((n,r)=>n+r.attempts,0),partial:values.filter(r=>r.partial).length,linkedFacts:values.reduce((n,r)=>n+r.linkedFacts,0),evidenceReplayPassed:values.every(r=>!r.validationError),validationFailures:values.filter(r=>r.validationError).length};
summary.medianReductionPercent=Math.round(100*(1-summary.conditions.after.medianMs/summary.conditions.before.medianMs));summary.rows=rows;
fs.writeFileSync(root+'performance-summary.json',JSON.stringify(summary,null,2));fs.writeFileSync(root+'performance-evidence-audit.txt',audit.join('\n\n'));console.log(JSON.stringify({...summary,rows:undefined},null,2));
