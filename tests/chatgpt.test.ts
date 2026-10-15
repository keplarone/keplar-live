import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate, authorization, CHATGPT_CLIENT, CHATGPT_REDIRECT, exchange, hash, issueCode, OAuthError, READ, revoke, WRITE, type Code, type Grant, type Store, type Stores } from '../src/lib/chatgpt/core';
import { handleMcp } from '../src/lib/chatgpt/transport';
import { TOOLS, validateArgs } from '../src/lib/chatgpt/tools';
const RESOURCE='https://business.keplar.one/api/chatgpt/mcp';
class Memory<T extends {id:string;workspaceId:string}> implements Store<T>{
 rows=new Map<string,T>();
 async insert(row:T){this.rows.set(row.id,{...row});return row;}
 async get(ws:string,id:string){const r=this.rows.get(id);return r?.workspaceId===ws?r:null;}
 async findSystemBy(field:string,value:string){return [...this.rows.values()].find(r=>(r as Record<string,unknown>)[field]===value)||null;}
 async remove(ws:string,id:string){return (await this.get(ws,id))!==null?this.rows.delete(id):false;}
}
const stores=():Stores=>({codes:new Memory<Code>(),grants:new Memory<Grant>()});
const verifier='a'.repeat(43);
const query=()=>new URLSearchParams({client_id:CHATGPT_CLIENT,redirect_uri:CHATGPT_REDIRECT,response_type:'code',code_challenge:hash(verifier),code_challenge_method:'S256',resource:RESOURCE,scope:`${READ} ${WRITE}`,state:'state-123'});
const tokenQuery=(code:string)=>new URLSearchParams({grant_type:'authorization_code',client_id:CHATGPT_CLIENT,code,redirect_uri:CHATGPT_REDIRECT,code_verifier:verifier,resource:RESOURCE});
async function connect(s:Stores,scopes=[READ,WRITE],now=Date.now()){
 const a={...authorization(query(),RESOURCE),scopes};
 const code=await issueCode(s,a,{workspaceId:'ws_alice',userId:'alice'},now);
 return exchange(s,tokenQuery(code),RESOURCE,now);
}
test('authorization pins client, redirect, resource and PKCE; rejects scope escalation and duplicate parameters',()=>{
 assert.deepEqual(authorization(query(),RESOURCE).scopes,[READ,WRITE]);
 for(const [k,v] of [['redirect_uri','https://evil.test/callback'],['client_id','https://evil.test/client'],['resource','https://evil.test/mcp'],['code_challenge_method','plain'],['code_challenge','short'],['scope','business:admin'],['scope',WRITE]]){
  const q=query();q.set(k,v);assert.throws(()=>authorization(q,RESOURCE),OAuthError);
 }
 const q=query();q.append('redirect_uri',CHATGPT_REDIRECT);assert.throws(()=>authorization(q,RESOURCE));
});
test('authorization code binds verifier, redirect, resource and owner; only one concurrent redemption wins',async()=>{
 const s=stores(),code=await issueCode(s,authorization(query(),RESOURCE),{workspaceId:'ws_alice',userId:'alice'});
 for(const [k,v] of [['code_verifier','b'.repeat(43)],['redirect_uri','https://evil.test'],['resource','other']]){const q=tokenQuery(code);q.set(k,v);await assert.rejects(()=>exchange(s,q,RESOURCE),OAuthError);}
 const all=await Promise.allSettled([exchange(s,tokenQuery(code),RESOURCE),exchange(s,tokenQuery(code),RESOURCE)]);
 assert.equal(all.filter(r=>r.status==='fulfilled').length,1);
 const t=all.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof exchange>>>;
 const grant=await authenticate(s,`Bearer ${t.value.access_token}`,RESOURCE,WRITE);
 assert.equal(grant.workspaceId,'ws_alice');assert.equal(grant.userId,'alice');
 await assert.rejects(()=>authenticate(s,null,RESOURCE));
 await assert.rejects(()=>authenticate(s,`Bearer ${t.value.access_token}x`,RESOURCE));
 await assert.rejects(()=>authenticate(s,`Bearer ${t.value.access_token}`,'other'));
});
test('codes and access tokens expire; bearer auth never accepts a cookie or refresh token',async()=>{
 const s=stores(),now=1_000_000,code=await issueCode(s,authorization(query(),RESOURCE),{workspaceId:'ws',userId:'u'},now);
 await assert.rejects(()=>exchange(s,tokenQuery(code),RESOURCE,now+120_000));
 const t=await connect(s,[READ],now);
 await assert.rejects(()=>authenticate(s,`Bearer ${t.access_token}`,RESOURCE,READ,now+3_600_000));
 await assert.rejects(()=>authenticate(s,`Bearer ${t.refresh_token}`,RESOURCE,READ,now));
 await assert.rejects(()=>authenticate(s,'Cookie: session=123',RESOURCE,READ,now));
 await assert.rejects(()=>authenticate(s,`Bearer ${t.access_token}`,RESOURCE,WRITE,now),e=>e instanceof OAuthError&&e.code==='insufficient_scope');
});
test('refresh rotates credentials atomically; rejects replay and permission escalation; revocation invalidates both tokens',async()=>{
 const s=stores(),t=await connect(s,[READ]);
 const q=new URLSearchParams({grant_type:'refresh_token',client_id:CHATGPT_CLIENT,refresh_token:t.refresh_token,resource:RESOURCE,scope:`${READ} ${WRITE}`});
 await assert.rejects(()=>exchange(s,q,RESOURCE));q.delete('scope');
 const all=await Promise.allSettled([exchange(s,q,RESOURCE),exchange(s,q,RESOURCE)]);
 assert.equal(all.filter(r=>r.status==='fulfilled').length,1);
 const next=(all.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof exchange>>>).value;
 await assert.rejects(()=>authenticate(s,`Bearer ${t.access_token}`,RESOURCE));
 await authenticate(s,`Bearer ${next.access_token}`,RESOURCE);
 await revoke(s,next.refresh_token,CHATGPT_CLIENT);
 await assert.rejects(()=>authenticate(s,`Bearer ${next.access_token}`,RESOURCE));
 q.set('refresh_token',next.refresh_token);await assert.rejects(()=>exchange(s,q,RESOURCE));
});
test('credentials are only stored as hashes',async()=>{
 const s=stores(),t=await connect(s);
 const serialized=JSON.stringify([...(s.grants as Memory<Grant>).rows.values()]);
 assert.ok(!serialized.includes(t.access_token.split('.')[1]));assert.ok(!serialized.includes(t.refresh_token.split('.')[1]));
});
test('tool argument validation refuses workspace spoofing, unknown keys, invalid statuses and oversized drafts',()=>{
 assert.equal(validateArgs('create_project',{name:'Cafe'}).name,'Cafe');
 for(const [name,args] of [['list_projects',{workspace_id:'ws_bob'}],['create_project',{name:''}],['update_task',{task_id:'tk_1',status:'published'}],['save_report',{title:'x',markdown:'a'.repeat(100001)}],['create_task',{project_id:'prj_1',title:'x',due:'tomorrow'}]] as const)assert.throws(()=>validateArgs(name,args));
 for(const t of TOOLS)assert.ok(t.securitySchemes.length>0);
});
const rpc=(method:string,params?:unknown,id:number|undefined=1)=>new Request(RESOURCE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
test('MCP initialization and discovery disclose no account data; malformed requests and unknown tools fail',async()=>{
 let called=0;const d={challenge:()=> 'Bearer resource_metadata="metadata"',authorize:async()=>{called++},execute:async()=>{called++;return {}}};
 assert.equal((await (await handleMcp(rpc('initialize',{protocolVersion:'2025-06-18'}),d)).json()).result.serverInfo.name,'Keplar Business');
 assert.equal((await (await handleMcp(rpc('tools/list'),d)).json()).result.tools.length,10);assert.equal(called,0);
 assert.equal((await handleMcp(new Request(RESOURCE,{method:'POST',body:'{'}),d)).status,400);
 assert.equal((await (await handleMcp(rpc('tools/call',{name:'spend_money'}),d)).json()).error.code,-32602);
});
test('MCP emits OAuth challenge and never calls operations before authorization; checks write scope',async()=>{
 let called=0,scope='';
 const denied=await handleMcp(rpc('tools/call',{name:'list_projects',arguments:{}}),{challenge:()=> 'Bearer resource_metadata="metadata"',authorize:async()=>{throw new OAuthError('invalid_token','Connect',401)},execute:async()=>{called++}});
 assert.equal(denied.status,401);assert.ok(denied.headers.get('www-authenticate'));assert.equal(called,0);assert.ok((await denied.json()).result._meta['mcp/www_authenticate']);
 const ok=await handleMcp(rpc('tools/call',{name:'create_project',arguments:{name:'Cafe'}}),{challenge:()=>'',authorize:async s=>{scope=s},execute:async()=>({id:'prj_alice'})});
 assert.equal(scope,WRITE);assert.equal((await ok.json()).result.structuredContent.data.id,'prj_alice');
 const spoof=await handleMcp(rpc('tools/call',{name:'list_projects',arguments:{workspaceId:'bob'}}),{challenge:()=>'',authorize:async()=>{called++},execute:async()=>{called++}});
 assert.equal((await spoof.json()).error.code,-32602);assert.equal(called,0);
});
