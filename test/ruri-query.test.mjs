import test from 'node:test';import assert from 'node:assert/strict';
import {ruriQuery} from '../src/ruri-query.mjs';
const messages=[{role:'user',content:'一時預かりってどんな制度？'},{role:'assistant',content:'一時預かり事業は、乳幼児を一時的に預かり、必要な保護を行います。'},{role:'user',content:'保育を受けることってなに？'}];
test('a wording follow-up searches the preceding explanation with its program',()=>{const q=ruriQuery(messages.at(-1).content,['一時預かり事業'],messages);assert.match(q,/一時預かり事業/);assert.match(q,/乳幼児を一時的に預かり/);assert.ok(!q.includes('事業の目的、支援内容、対象者の概要'));});
test('an explicitly named new topic does not carry the old explanation into search',()=>{const q=ruriQuery('産後ケアってなに？',['産後ケア事業'],messages);assert.ok(!q.includes('乳幼児を一時的に預かり'));});
test('a fee question retains the cost retrieval terms',()=>{assert.match(ruriQuery('それはいくら？',['一時預かり事業'],messages),/利用料/);});

test('a request to simplify the last reply retains its subject',()=>{for(const text of ['もっと簡単に','それってどういうこと？','もう少しわかりやすく'])assert.match(ruriQuery(text,['一時預かり事業'],[...messages.slice(0,-1),{role:'user',content:text}]),/乳幼児を一時的に預かり/);});
