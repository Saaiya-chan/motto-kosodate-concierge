import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeConfig} from '../src/runtime-config.mjs';
test('local defaults remain loopback-only with insecure local cookies',()=>{const r=runtimeConfig({});assert.equal(r.bindHost,'127.0.0.1');assert.equal(r.secureCookies,false);assert.equal(r.origins.has('https://evil.example'),false);});
test('Railway domain enables only its HTTPS origin and secure cookies',()=>{const r=runtimeConfig({PORT:'8080',RAILWAY_PUBLIC_DOMAIN:'concierge.up.railway.app'});assert.equal(r.publicOrigin,'https://concierge.up.railway.app');assert.equal(r.bindHost,'0.0.0.0');assert.equal(r.secureCookies,true);assert.equal(r.hosts.has('concierge.up.railway.app'),true);assert.equal(r.origins.has('http://concierge.up.railway.app'),false);assert.equal(r.origins.has('https://evil.example'),false);});
test('explicit public origin cannot contain insecure transport, credentials or paths',()=>{for(const value of ['http://example.com','https://user:pass@example.com','https://example.com/sub','https://example.com/?q=x'])assert.throws(()=>runtimeConfig({APP_PUBLIC_ORIGIN:value}));});
