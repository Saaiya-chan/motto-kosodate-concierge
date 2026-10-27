import fs from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const data = JSON.parse(await fs.readFile(new URL('.private/search-probe-cloud-run.json', root), 'utf8'));
const median = values => { const a = [...values].sort((a,b)=>a-b); return (a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2; };
const result = {method:'Same 12 files, 79 chunks, Gemini and validators unchanged. Two six-turn synthetic conversations for each backend. Local Mac versus Cloud Run Tokyo, not matched hardware. One generation per question; no statistical confidence claim.', providers:{}, retrievalIdentical:data.retrieval.filter(x=>x.same).length, retrievalQuestions:data.retrieval.length};
for (const provider of ['baseline','target']) {
  const rows = data.conversations.filter(x=>x.provider===provider&&!x.error);
  if(rows.length!==12) throw Error('Incomplete provider: '+provider);
  const attempts = rows.flatMap(x=>x.review.attempts||[]);
  let input=0,cached=0,output=0;
  for(const a of attempts){const u=a.usage||{};input+=u.promptTokenCount||0;cached+=u.cachedContentTokenCount||0;output+=(u.candidatesTokenCount||0)+(u.thoughtsTokenCount||0);}
  result.providers[provider] = {turns:rows.length, medianAnswerMs:median(rows.map(x=>x.elapsedMs)), meanAnswerMs:Math.round(rows.reduce((n,x)=>n+x.elapsedMs,0)/rows.length),minAnswerMs:Math.min(...rows.map(x=>x.elapsedMs)),maxAnswerMs:Math.max(...rows.map(x=>x.elapsedMs)),medianSearchMs:median(rows.map(x=>x.timings.upstreamMs)),medianReviewMs:median(rows.map(x=>x.timings.reviewMs)),replayPassed:rows.every(x=>x.replayPassed),partial:rows.filter(x=>x.review.partial).length,geminiAttempts:attempts.length,inputTokens:input,cachedInputTokens:cached,outputAndThinkingTokens:output,per1000QuestionsGeminiUSD:((input-cached)*.30+cached*.03+output*2.50)/1e6/rows.length*1000};
}
result.metrics=data.metrics;
await fs.writeFile(new URL('.private/cloud-run-summary.json',root),JSON.stringify(result,null,2));
// Adapt to the existing quote/link audit without changing the validator or its claims.
await fs.writeFile(new URL('.private/cloud-run-audit-input.json',root),JSON.stringify({turns:data.conversations.filter(x=>!x.error)},null,2),{mode:0o600});
console.log(JSON.stringify(result,null,2));
