import {bindLogConsent} from './logging.js';
import {bindChatInput} from './input.js';
const $=id=>document.getElementById(id);let messages=[],pending=false,generation=0,lastConsultation='';let activeProvider='docsgpt',cloudReady=false,docsgptSessionId;const sessions=new Map(),answerData=new Map();let editingIndex=null,draftBeforeEdit='';
document.body.dataset.provider=activeProvider;
const logConsent=bindLogConsent();
const starters=[
 '2歳の子がいます。少し休むために、昼間だけ預けられる支援はありますか？',
 '子育てショートステイの料金と、申し込み方を知りたいです。',
 '家事と育児で手いっぱいです。自宅で手伝ってもらえる支援はありますか？',
 '保育園のお迎えに間に合いません。送迎を頼める支援はありますか？',
 '産後の体調や授乳がつらいです。相談できる支援はありますか？'
];
function conversationTemplates(){
 const users=messages.filter(m=>m.role==='user');const latest=users.at(-1)?.content||'';
 if(/ありがとう/.test(latest)&&!/[?？]/.test(latest))return ['別の困りごとについても相談したいです。','窓口に相談した結果を、一緒に整理してほしいです。'];
 let subject='この支援';
 for(const m of [...users].reverse()){
  const topics=[[/産後ケア|産後/, '産後ケア'],[/ショートステイ|子育て短期支援/,'子育てショートステイ'],[/一時預かり|昼間.*預け/,'一時預かり'],[/訪問支援|自宅.*手伝|家事/,'自宅で受けられる支援'],[/送迎|お迎え/,'送迎の支援'],[/病児|病気の子/,'病児保育']];
  const found=topics.find(([pattern])=>pattern.test(m.content));if(found){subject=found[1];break;}
 }
 if(/料金|費用|お金|減免/.test(latest))return [`${subject}の料金や減免について、窓口に何を確認すればいいですか？`,`${subject}を利用するには、どこに申し込めばいいですか？`,'電話で相談するとき、そのまま使える文を作ってください。'];
 if(/文を|申し込|申込|電話/.test(latest))return ['相談のときに伝えることを、短くまとめてください。','利用できない場合に、別の支援も考えたいです。','ありがとうございます。まず窓口に相談してみます。'];
 return [`${subject}は、どんなときに利用できますか？`,`${subject}の料金や減免は、どう確認すればいいですか？`,'今の状況を窓口に伝える相談文を作ってください。'];
}
function el(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function bubble(role,text,index){
 const row=el('div',undefined,'message-row '+role),e=el('div',text,'bubble '+role);row.append(e);$('messages').append(row);
 if(Number.isInteger(index)){
  const actions=el('div',undefined,'message-actions');actions.setAttribute('aria-label',role==='user'?'メッセージの操作':'回答の操作');
  const copy=el('button','コピー');copy.type='button';copy.setAttribute('aria-label',role==='user'?'メッセージをコピー':'回答をコピー');
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(e.copyText??text);copy.textContent='コピーしました';}catch{copy.textContent='コピーできませんでした';}setTimeout(()=>copy.textContent='コピー',2000);};actions.append(copy);
  if(role==='user'){
   const edit=el('button','編集','message-edit');edit.type='button';edit.setAttribute('aria-label','メッセージを編集');edit.disabled=pending;
   edit.onclick=()=>{if(pending)return;if(editingIndex===null)draftBeforeEdit=$('message').value;editingIndex=index;$('edit-notice').hidden=false;$('message').value=text;$('message').focus();$('message').scrollIntoView({block:'nearest'});updateAvailability();};actions.append(edit);
  }
  row.append(actions);
 }
 $('messages').scrollTop=$('messages').scrollHeight;return e;
}
function clearEditing(restore=false){editingIndex=null;$('edit-notice').hidden=true;if(restore)$('message').value=draftBeforeEdit;draftBeforeEdit='';updateAvailability();}
$('cancel-edit').onclick=()=>{clearEditing(true);$('message').focus();};
function renderMessages(list=messages,answers=answerData){
 $('messages').replaceChildren();bubble('assistant','こんにちは。\nいま、いちばん手伝ってほしいことを教えてください。');
 list.forEach((m,i)=>{const b=bubble(m.role,m.content,i);if(m.role==='assistant'&&answers.has(i))attachSources(b,answers.get(i));});
}
function choices(items){
 const draft=activeProvider==='docsgpt';$('template-area').hidden=!items.length;
 $('choices').replaceChildren();for(const value of items){const b=el('button',value,'choice');b.type='button';b.disabled=pending;b.onclick=()=>{if(draft){$('message').value=value;$('message').focus();}else submit(value);};$('choices').append(b);}
}
function showFacts(f){const labels={rest:'少し休みたい',day:'日中',overnight:'泊まり',evening:'夜間',weekend:'休日',pickup:'送迎',housework:'家事',care:'自宅で育児',postpartum:'産後',breastfeeding:'授乳',sick:'病気の子',parent_ill:'親の入院・病気',advice:'育児相談',social:'交流・通園経験',isolation:'話し相手',errand:'通院・用事',singleparent:'ひとり親の支援'};const wrap=el('div',undefined,'fact-tags');for(const n of f.needs)wrap.append(el('span',labels[n]||n,'tag'));for(const a of f.agesMonths)wrap.append(el('span',a<12?`${a}か月`:`${Math.floor(a/12)}歳${a%12?`${a%12}か月`:''}`,'tag'));if(f.enrolled!=='unknown')wrap.append(el('span',f.enrolled==='yes'?'通園中':'通園していない','tag'));$('facts').replaceChildren(wrap);}
function recommendationPreview(data){
document.querySelectorAll('.recommendation-preview').forEach(node=>node.remove());
if(data.showRecommendations===false||!data.results?.length)return;
const preview=el('div',undefined,'recommendation-preview');
preview.append(el('strong',data.question?'いまの時点で考えられる候補':'あなたに合いそうな支援の候補'));
const list=el('ul');
for(const p of data.results){const item=el('li');const link=el('a',p.name+' →');link.href='#program-'+p.id;link.onclick=e=>{e.preventDefault();showProgram(p.id);};item.append(link,el('span','理由：'+p.why.join('・')));list.append(item);}
preview.append(list,el('p','地域の窓口・料金・空き状況は、まだ確認していません。','preview-note'));
$('messages').append(preview);$('messages').scrollTop=$('messages').scrollHeight;
}
function showProgram(id){const target=$('program-'+id);if(!target)return;target.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});target.focus({preventScroll:true});}
function sourceLink(source){const a=el('a','公式の案内：'+source.title+' ↗');a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function attachDocsGPTSources(answer,data){
 answer.replaceChildren();const sources=new Map((data.replySources||[]).map(source=>[source.citationNumber,source]));
 const richText=(line,text)=>{
  for(const part of text.replace(/^#{1,6}\s*/gm,'').split(/(\[\d+\]|\*\*[^*]+\*\*)/)){
   const match=part.match(/^\[(\d+)\]$/);
   if(match){const number=Number(match[1]),source=sources.get(number);if(source?.url){const link=el('a',part,'inline-citation');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.title=source.title;link.setAttribute('aria-label',`出典${number}：${source.title}（公式資料を開く）`);line.append(link);}else line.append(el('span',part+'（リンク未取得）'));}
   else if(part.startsWith('**')&&part.endsWith('**'))line.append(el('strong',part.slice(2,-2)));
   else line.append(document.createTextNode(part));
  }
 };
 answer.classList.add('structured-answer');
 for(const paragraph of data.reply.split(/\n\s*\n/)){
  let prose=[];
  const flush=()=>{if(prose.length){const p=el('p',undefined,'answer-statement');richText(p,prose.join('\n'));answer.append(p);prose=[];}};
  for(const text of paragraph.split('\n')){
   const bullet=text.match(/^\s*(?:[-*]\s+|[・●]\s*)(.+)$/);
   if(bullet){flush();let list=answer.lastElementChild;if(list?.tagName!=='UL'){list=el('ul',undefined,'answer-list');answer.append(list);}const item=el('li');const label=bullet[1].match(/^([^：\n]{1,35}：)(.*)$/s);if(label){item.append(el('strong',label[1]));richText(item,label[2]);}else richText(item,bullet[1]);list.append(item);}
   else if(text.trim())prose.push(text);
  }
  flush();
 }
}
function attachSources(answer,data){
 answer.copyText=(data.reply||answer.textContent).replace(/\[(\d+)\]/g,(marker,n)=>{const source=data.replySources?.find(s=>s.citationNumber===Number(n));return source?.url?`[${n}](${source.url})`:marker;});
 if(data.mode==='docsgpt-gemini'){attachDocsGPTSources(answer,data);return;}
 if(data.replyStatements?.length||data.replyGuidance?.length||data.replyOpening){
  answer.replaceChildren();if(data.warning)answer.append(el('p',data.warning));if(data.replyOpening)answer.append(el('p',data.replyOpening));if(!data.replyStatements?.length&&data.replyBody)answer.append(el('p',data.replyBody));
  for(const statement of data.replyStatements||[]){
   const line=el('p',statement.text,'answer-statement');
   for(const id of new Set(statement.evidence.map(e=>e.chunkId))){
    const index=data.replySources.findIndex(s=>s.id===id),source=data.replySources[index];
    const link=el('a',`[${index+1}]`,'inline-citation');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.title=source.title;link.setAttribute('aria-label',`出典${index+1}：${source.title}`);line.append(' ',link);
   }answer.append(line);
  }
  if(data.replyLimit)answer.append(el('p',data.replyLimit));
  if(data.replyGuidance?.length){const guide=el('div',undefined,'reply-guidance');guide.append(el('strong','次にできること（確認の提案）'));for(const text of data.replyGuidance)guide.append(el('p',text));answer.append(guide);}
  if(data.replyFollowup)answer.append(el('p',data.replyFollowup));
 }
 if(data.replySources?.length){const refs=el('div',undefined,'reply-sources');
  data.replySources.forEach((source,i)=>{const heading=el('div',`[${i+1}] `);heading.append(sourceLink(source));refs.append(heading);
   const quotes=[...new Set((data.replyStatements||[]).flatMap(s=>s.evidence.filter(e=>e.chunkId===source.id).map(e=>e.quote)))];
   if(quotes.length||source.excerpt){const detail=el('details');detail.append(el('summary',quotes.length?'この回答の根拠を読む':'回答の根拠になった資料本文'));
    for(const quote of quotes)detail.append(el('blockquote',quote));
    if(source.excerpt)detail.append(el('p',source.excerpt,'source-excerpt'));refs.append(detail);}
  });answer.append(refs);
 }
}
function updateAvailability(){
 document.querySelectorAll('.message-edit').forEach(b=>b.disabled=pending);$('cancel-edit').disabled=pending;
 $('send').textContent=editingIndex===null?'相談する ↗':'変更して送信 ↗';
 $('send').disabled=pending||(activeProvider!=='local'&&!cloudReady);for(const button of $('choices').querySelectorAll('button'))button.disabled=$('send').disabled;
}
function results(data){showFacts(data.facts);$('result-section').hidden=false;$('result-summary').textContent=data.summary;$('urgent').hidden=!data.urgent;const cards=$('cards');cards.replaceChildren();data.results.forEach((p,i)=>{const c=el('article',undefined,'service-card');c.id='program-'+p.id;c.tabIndex=-1;c.append(el('div',String(i+1).padStart(2,'0'),'rank'),el('h3',p.name),el('div',p.tagline,'tagline'),el('p',p.summary),el('div','お話とのつながり：'+p.why.join('・'),'why'));for(const w of p.warnings)c.append(el('p',w,'warning'));const d=el('details');d.append(el('summary','似ている制度との違い'),el('p',p.difference));c.append(d,el('h4','利用前に確かめること'));const ul=el('ul');for(const text of p.checks)ul.append(el('li',text));c.append(ul,sourceLink(p.sources[0]),el('div','情報確認：'+p.sources[0].checkedAt,'source-date'));cards.append(c);});lastConsultation=data.consultation;$('consultation').textContent=lastConsultation;$('consultation-box').hidden=!data.results?.length;}
async function submit(text){if(pending||$('send').disabled||!text.trim())return;text=text.trim();if(text.length>2000){$('error').textContent='2000文字以内で入力してください。';$('error').hidden=false;return;}if(editingIndex===null&&messages.length>=18){bubble('assistant','会話が長くなりました。「最初から」で、新しい相談を始めてください。');return;}
await logConsent.wait();if(pending)return;const logFields=logConsent.requestFields();const id=++generation;pending=true;$('error').hidden=true;$('message').value='';$('send').disabled=true;$('reset').disabled=true;choices([]);const editAt=editingIndex;const requestMessages=[...messages.slice(0,editAt??messages.length),{role:'user',content:text}];if(editAt!==null)renderMessages(requestMessages,new Map([...answerData].filter(([i])=>i<editAt)));else bubble('user',text,requestMessages.length-1);updateAvailability();const loading=bubble('assistant','登録資料を検索して回答を作っています');loading.classList.add('loading');const dots=el('span',undefined,'loading-dots');dots.setAttribute('aria-hidden','true');for(let i=0;i<3;i++)dots.append(el('span',undefined,'loading-dot'));loading.append(dots);
try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...logFields,messages:requestMessages,guided:false,provider:activeProvider,...(activeProvider==='docsgpt'&&docsgptSessionId?{sessionId:docsgptSessionId,...(editAt!==null?{editIndex:editAt}:{})}:{})}),signal:AbortSignal.timeout(100000)});const data=await r.json();logConsent.result(data,logFields.logConsentToken);if(!r.ok)throw Error('回答を取得できませんでした。時間をおいて、もう一度お試しください。');if(id!==generation)return;loading.parentElement.remove();if(activeProvider==='docsgpt')docsgptSessionId=data.docsgptSessionId;messages=requestMessages;if(editAt!==null){for(const i of answerData.keys())if(i>=editAt)answerData.delete(i);}clearEditing();const content=(data.warning?data.warning+'\n\n':'')+(data.reply||(data.question?data.question.text:data.summary));const answer=bubble('assistant',content,requestMessages.length);attachSources(answer,data);$('messages').scrollTop=$('messages').scrollHeight;messages.push({role:'assistant',content:data.reply||data.question?.text||data.summary});answerData.set(messages.length-1,data);sessions.set(activeProvider,{messages:[...messages],answers:new Map(answerData),data});if(data.showRecommendations!==false)results(data);recommendationPreview(data);pending=false;choices(activeProvider==='docsgpt'?conversationTemplates():data.replyOptions||data.question?.options||(data.showRecommendations===false?['料金はどう確認すればいい？','申し込みはどうすればいい？']:['送り迎えも難しいです','自宅での手助けを希望します','料金はどう確認すればいい？']));$('status').textContent='';
}catch(e){loading.parentElement?.remove();renderMessages();$('error').textContent=e.name==='TimeoutError'?'AIの回答に時間がかかっています。少し待って、もう一度送信してください。':e.message;$('error').hidden=false;pending=false;choices(['少し休みたい','家事を手伝ってほしい']);$('message').value=text;}
finally{pending=false;updateAvailability();$('reset').disabled=false;$('message').focus();}}
bindChatInput($('chat-form'),$('message'),submit);
function resetConversation(){clearEditing();logConsent.newConversation();generation++;messages=[];docsgptSessionId=undefined;answerData.clear();$('messages').replaceChildren();$('cards').replaceChildren();$('result-section').hidden=true;$('facts').replaceChildren(el('p','お話に合わせて、ここに整理します。','muted'));$('error').hidden=true;lastConsultation='';$('consultation').textContent='';$('copy').textContent='文をコピー';$('message').value='';welcome();$('message').focus();}
$('reset').onclick=()=>{sessions.delete(activeProvider);resetConversation();};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(lastConsultation);$('copy').textContent='コピーしました';}catch{$('copy').textContent='相談文を選択してコピーしてください';}};
function welcome(){bubble('assistant','こんにちは。\nいま、いちばん手伝ってほしいことを教えてください。');choices(starters);}
async function init(){welcome();try{const [c,library]=await Promise.all([fetch('/api/catalog').then(r=>r.json()),fetch('/api/sources').then(r=>r.json())]);$('source-status').textContent=`公式資料${library.sources.length}件の本文を参照して回答します。`;for(const source of library.sources){const row=el('div',undefined,'catalog-item');row.append(sourceLink(source));$('source-list').append(row);}for(const p of c.programs){const d=el('div',undefined,'catalog-item');d.append(el('strong',p.name),el('p',p.summary),sourceLink(p.sources[0]));$('catalog-list').append(d);}}catch{$('status').textContent='接続を確認できません。ページを再読み込みしてください。';}}
async function refreshAvailability(){
 try{const r=await fetch('/api/docsgpt/status');if(!r.ok)throw Error('unavailable');const state=await r.json();cloudReady=state.ready;$('status').textContent=cloudReady?'':'ただいま相談を受け付けられません。時間をおいて、もう一度お試しください。';}
 catch{cloudReady=false;$('status').textContent='接続を確認できません。時間をおいて、ページを再読み込みしてください。';}
 updateAvailability();
}
init();refreshAvailability();
