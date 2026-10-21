import fs from 'node:fs';import crypto from 'node:crypto';
const file='evaluation/docsgpt/results/comparison.json';const data=JSON.parse(fs.readFileSync(file));const chunks=JSON.parse(fs.readFileSync('evaluation/docsgpt/results/chunks.json')).chunks;const map=new Map(chunks.map(c=>[crypto.createHash('md5').update(c.text).digest('hex'),c]));
const audit=[];
for(const s of data.scenarios)for(const t of s.turns){const d=t.docsgpt?.data;if(!d?.answer)continue;const ids=[...new Set([...d.answer.matchAll(/\[(\d+)\]/g)].map(m=>+m[1]))];audit.push({scenario:s.id,turn:t.turn,question:t.question,docsgpt:d.answer,ruri:t.ruri?.data.reply,ruriMode:t.ruri?.data.mode,ruriRejected:t.ruri?.data.groundingRejected,ruriSources:t.ruri?.data.replySources?.map(x=>x.id),citations:ids.map(id=>{const src=d.sources?.[id-1];return{number:id,source:src,chunk:map.get(src?.chunk_key)??null}})});}
fs.writeFileSync('evaluation/docsgpt/results/citation-audit.json',JSON.stringify(audit,null,2));
console.log(audit.map(x=>`${x.scenario} #${x.turn}\nUSER ${x.question}\nDOCSGPT ${x.docsgpt}\nCITES ${x.citations.map(c=>`${c.number}:${c.source?.filename}:full=${!!c.chunk}`).join(', ')}\nRURI ${x.ruri}\n`).join('\n'));
