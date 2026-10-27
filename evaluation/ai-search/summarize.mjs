import fs from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const resultFile=process.env.AI_SEARCH_EVAL_FILE||'ai-search-comparison.json';
const data=JSON.parse(await fs.readFile(new URL('.private/'+resultFile,root),'utf8'));
const median=values=>{const a=[...values].sort((x,y)=>x-y);return (a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2;};
const summary={measuredAt:new Date().toISOString(),method:'Same twelve files; two six-turn synthetic conversations per provider, alternating provider order. DocsGPT on local Mac, AI Search REST over the Internet; Gemini and citation code unchanged. One generated answer per question. Intentional pacing excluded. No statistical confidence claim.',providers:{}};
for(const provider of ['docsgpt','ai-search']){
 const rows=data.turns.filter(t=>t.provider===provider&&!t.error);
 if(rows.length!==12)throw Error('Comparison incomplete: '+provider+' '+rows.length);
 const normal=rows.filter(t=>!t.rateLimited);
 const attempts=rows.flatMap(t=>t.review.attempts||[]);
 let input=0,cached=0,output=0;
 for(const a of attempts){const u=a.usage||{};input+=u.promptTokenCount||0;cached+=u.cachedContentTokenCount||0;output+=(u.candidatesTokenCount||0)+(u.thoughtsTokenCount||0);}
 const cost=((input-cached)*.30+cached*.03+output*2.50)/1e6;
 summary.providers[provider]={turns:rows.length,rateLimitedTurns:rows.length-normal.length,medianMs:median(normal.map(t=>t.elapsedMs)),meanMs:Math.round(normal.reduce((n,t)=>n+t.elapsedMs,0)/normal.length),medianSearchMs:median(normal.map(t=>t.timings.upstreamMs)),medianReviewMs:median(normal.map(t=>t.timings.reviewMs)),minMs:Math.min(...normal.map(t=>t.elapsedMs)),maxMs:Math.max(...normal.map(t=>t.elapsedMs)),citationReplayPassed:rows.every(t=>t.replayPassed),partialResponses:rows.filter(t=>t.review.partial).length,modelCalls:attempts.length,inputTokens:input,cachedInputTokens:cached,outputAndThinkingTokens:output,geminiPaidRateEstimateUSD:cost,per1000QuestionsGeminiPaidRateUSD:cost/rows.length*1000};
}
summary.priceBasis={Gemini:'Standard paid rate: $0.30/1M input, $0.03/1M cached input, $2.50/1M output including thinking. Estimate from usage metadata, not invoice. Free-tier billing status not verified.',AI_Search:'From 2026-11-01: 1000 semantic queries/month included, then $0.75/1000; ingestion 5M tokens and storage 10GB-month included. Account-wide allowances and other usage may change total.',sources:['https://ai.google.dev/gemini-api/docs/pricing','https://developers.cloudflare.com/ai-search/platform/limits-pricing/']};
await fs.writeFile(new URL('.private/'+resultFile.replace('.json','-summary.json'),root),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
