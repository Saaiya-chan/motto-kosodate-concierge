import fs from 'node:fs';
const {promptId}=JSON.parse(fs.readFileSync('evaluation/docsgpt/results/agent.json'));
const base='http://127.0.0.1:7093';const r=await fetch(`${base}/api/get_single_prompt?id=${promptId}`);if(!r.ok)throw Error('prompt read failed');const before=await r.json();
const marker='## 出典の制度と内容の一致';
const addition=`\n${marker}\n制度の説明に引用を付ける前に、対象の制度と、引用する節で扱っている制度が同じか確認してください。子育て短期支援事業のショートステイと産後ケアのショートステイを混同しないでください。誰でも通園・訪問支援の料金設定を、一時預かりや子育てショートステイの料金設定に流用しないでください。資料全体が複数制度を扱うときは、その制度を明記した節だけを根拠としてください。\n相談文、窓口に尋ねる項目、次の行動の提案には、無理に制度の引用を付けないでください。提案文の末尾に、別制度の出典を追加することは禁止です。制度の事実を補足する場合だけ、その説明を直接裏付ける同じ制度の資料を引用してください。資料にない金額・減免条件・空きは断定しないでください。\n`;
fs.writeFileSync('evaluation/docsgpt/results/prompt-before-citation-fix.json',JSON.stringify(before,null,2));
const content=before.content.includes(marker)?before.content:before.content+addition;
const updated=await fetch(base+'/api/update_prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:promptId,name:before.name,content,expected_updated_at:before.updated_at})});if(!updated.ok)throw Error('prompt update failed '+updated.status);fs.writeFileSync('evaluation/docsgpt/domain-prompt.txt',content);console.log('Updated citation instructions; original preserved.');
