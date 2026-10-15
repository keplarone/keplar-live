import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authorization, CHATGPT_CLIENT, CHATGPT_REDIRECT, exchange, hash, issueCode, READ, revoke, authenticate, type Code, type Grant } from '../src/lib/chatgpt/core';
test('real file store: tenant isolation, concurrent code redemption and revocation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'keplar-chatgpt-'));
 process.env.KEPLAR_DATA_DIR=dir;
 delete process.env.DATABASE_URL;delete process.env.POSTGRES_URL;delete process.env.POSTGRES_URL_NON_POOLING;
 try{
  const {collection}=await import('../src/lib/create/platform/store');
  const stores={codes:collection<Code>('chatgpt_codes'),grants:collection<Grant>('chatgpt_grants')};
  const resource='https://business.keplar.one/api/chatgpt/mcp',verifier='a'.repeat(43);
  const q=new URLSearchParams({client_id:CHATGPT_CLIENT,redirect_uri:CHATGPT_REDIRECT,response_type:'code',code_challenge:hash(verifier),code_challenge_method:'S256',resource,scope:READ,state:'state'});
  const code=await issueCode(stores,authorization(q,resource),{workspaceId:'alice',userId:'user_alice'});
  const body=new URLSearchParams({client_id:CHATGPT_CLIENT,redirect_uri:CHATGPT_REDIRECT,grant_type:'authorization_code',code,code_verifier:verifier,resource});
  const outcomes=await Promise.allSettled(Array.from({length:8},()=>exchange(stores,body,resource)));
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  const tokens=(outcomes.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof exchange>>>).value;
  const grant=await authenticate(stores,`Bearer ${tokens.access_token}`,resource);
  assert.equal(await stores.grants.get('bob',grant.id),null);
  assert.equal(await stores.grants.remove('bob',grant.id),false);
  await authenticate(stores,`Bearer ${tokens.access_token}`,resource);
  await revoke(stores,tokens.refresh_token,CHATGPT_CLIENT);
  await assert.rejects(()=>authenticate(stores,`Bearer ${tokens.access_token}`,resource));
 }finally{await rm(dir,{recursive:true,force:true});}
});
