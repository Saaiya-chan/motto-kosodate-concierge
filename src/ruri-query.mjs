import {isFeeQuestion} from './fee-intent.mjs';
import {namedPrograms} from './dialogue.mjs';
export function ruriQuery(text,names=[],messages=[]){
 let detail=text;
 if(/休みたい|休息|育児疲れ|疲れました|しんどい/.test(text))detail+=' 育児負担の軽減のため、乳幼児を一時的に預ける支援';
 const meaning=/って(?:なに|何)|どういう(?:意味|こと)|(?:とは|の意味)|わかりやす|分かりやす|かみ砕|かみくだ|つまり|具体的|もっと簡単|もう(?:少し|ちょっと)|よく(?:分|わ)から/.test(text);
 if(isFeeQuestion(text))detail+=' 利用者が支払う利用料、費用負担、所得状況に応じた減免の定め';
 if(!meaning&&/どんな|って何|とは|どういう/.test(text))detail+=' 事業の目的、支援内容、対象者の概要';
 if(/掃除|料理|家事/.test(text))detail+=' 家事支援の具体的な内容、範囲、通常の支援と特例的な支援の参考例';
 // A follow-up explains the preceding reply, while an explicitly named new program starts a new topic.
 if(meaning&&!namedPrograms(text).length){
  const previous=messages.slice(0,-1).findLast(m=>m.role==='assistant');
  if(previous)detail+=' 直前に説明した言葉の意味・やさしい言い換え: '+previous.content.slice(0,700);
 }
 return names.join(' ')+' '+detail;
}
