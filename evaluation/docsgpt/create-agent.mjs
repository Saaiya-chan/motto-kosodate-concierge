import fs from 'node:fs';
const base='http://127.0.0.1:7093';
async function post(route,body){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const t=await r.text();if(!r.ok)throw new Error(`${route} ${r.status} ${t.slice(0,300)}`);return JSON.parse(t)}
const frag='evaluation/docsgpt/source/docsgpt/prompts/fragments/';
const parts=['identity.txt','persona.txt',null,'citations.txt','formatting.txt','boundaries.txt','platform.txt','background.txt','memory.txt','attachments.txt'];
const domain=`## Answering\nあなたは子育て支援制度の相談相手です。日本語で、相談者の気持ちと直前までの会話を踏まえ、今回の質問に直接、短く自然に答えてください。質問を繰り返したり制度一覧に戻したりしないでください。\n制度・対象・費用・利用条件などの事実は提供された資料に基づき、補足説明も該当資料を引用してください。資料中の用語は文脈に即して平易な日本語に言い換えられます。制度の事実を一般知識で補完しないでください。資料にない自治体の金額、空き状況、窓口名・電話番号、個別利用可否は断定しないでください。運営者への補助金を利用者の料金と混同しないでください。\n資料が足りない場合は不明な範囲を限定して説明し、資料で分かることと次に確認することを案内してください。確認項目の整理や相談文の作成は「確認の提案」「相談文の例」として提供できます。確認できませんだけで終えないでください。お礼には自然に応じ、新たな質問を強要しないでください。\n\n`;
const content=parts.map(p=>p?fs.readFileSync(frag+p,'utf8'):domain).join('');
fs.writeFileSync('evaluation/docsgpt/domain-prompt.txt',content);
const prompt=await post('/api/create_prompt',{name:'子育て相談・資料根拠と次の行動',content});
const upload=JSON.parse(fs.readFileSync('evaluation/docsgpt/results/upload.json'));
const agent=await post('/api/create_agent',{name:'motto比較・12資料＋Gemini',description:'Local evaluation only: same 12 official sources and Gemini 3.5 Flash Lite',source:upload.source_id,chunks:6,retriever:'classic',prompt_id:prompt.id,agent_type:'classic',status:'published',models:['gemini-3.5-flash-lite'],default_model_id:'gemini-3.5-flash-lite',tools:[]});
fs.writeFileSync('.private/docsgpt-agent.json',JSON.stringify(agent),{mode:0o600});
fs.writeFileSync('evaluation/docsgpt/results/agent.json',JSON.stringify({id:agent.id,promptId:prompt.id,model:'gemini-3.5-flash-lite',chunks:6,sourceId:upload.source_id},null,2));
console.log('created agent',agent.id,'key stored privately');
