import test from 'node:test';import assert from 'node:assert/strict';
import {isLocalModel} from '../src/llm.mjs';
test('model metadata must identify an installed local model',()=>{assert.ok(isLocalModel({name:'qwen3:4b'}));assert.equal(isLocalModel(null),false);assert.equal(isLocalModel({name:'my-local-alias',remote_model:'qwen3:4b',remote_host:'https://ollama.com'}),false);assert.equal(isLocalModel({name:'qwen3:cloud'}),false);});
