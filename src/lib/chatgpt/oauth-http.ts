import { createHmac } from 'node:crypto';
import { getSession, magicLinkSecret } from '@/lib/accounts/auth';
import { requireAccount } from '@/lib/create/platform/workspace';
import { requireBusiness } from '@/lib/business/require';
import { HttpError, errorResponse } from '@/lib/create/platform/http';
import { clientIpOf, rateLimit } from '@/lib/create/platform/ratelimit';
import { assertSameOrigin } from '@/lib/security/origin';
import { cookieValue } from '@/lib/business/handoff';
import { authorization, exchange, hash, issueCode, opaque, OAuthError, random, revoke } from './core';
import { ISSUER, RESOURCE } from './config';
import { verifyChatGPTClient } from './client';
import { pending, requireStorage, stores } from './store';

const COOKIE='__Secure-keplar_chatgpt_consent';
const PATH='/api/chatgpt/oauth/authorize';
export const oauthJson=(v:unknown,status=200)=>Response.json(v,{status,headers:{'cache-control':'no-store','pragma':'no-cache','access-control-allow-origin':'*'}});
export function failure(e:unknown){return e instanceof OAuthError?oauthJson({error:e.code,error_description:e.message},e.status):errorResponse(e);}
export async function boundedText(req:Request,max=16_384):Promise<string>{
 const reader=req.body?.getReader();if(!reader)return '';
 let out='',bytes=0;const decoder=new TextDecoder();
 for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max){await reader.cancel();throw new OAuthError('invalid_request','Request body too large.',413);}out+=decoder.decode(value,{stream:true});}
 return out+decoder.decode();
}
async function form(req:Request){if(!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))throw new OAuthError('invalid_request','Expected form encoding.',415);return new URLSearchParams(await boundedText(req));}
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const proof=(rid:string,uid:string,wid:string,nonce:string)=>createHmac('sha256',magicLinkSecret()).update(JSON.stringify(['keplar-chatgpt-consent-v1',rid,uid,wid,nonce])).digest('hex');
const redirect=(url:string,cookie?:string)=>new Response(null,{status:303,headers:{location:url,'cache-control':'no-store','referrer-policy':'no-referrer',...(cookie?{'set-cookie':cookie}:{})}});
async function owner(req:Request){const account=await requireAccount(req);const ws=await requireBusiness(req);if(ws.id!==account.id||!ws.userId||!ws.verified)throw new HttpError(403,'Connect the owner’s personal Business workspace. Shared-workspace connections are not supported yet.');return ws;}
async function limit(req:Request){await rateLimit(`chatgpt:oauth:${clientIpOf(req)}`,60,600,{shared:true});requireStorage();}
function issuerOnly(req:Request){if(new URL(req.url).origin!==ISSUER)throw new HttpError(400,`Use ${ISSUER}${PATH} to authorize.`);}
export async function authorizeGet(req:Request){try{
 issuerOnly(req);await limit(req);
 const q=new URL(req.url).searchParams;
 let rid=q.get('request');
 if(!rid){
  const a=authorization(q,RESOURCE);await verifyChatGPTClient();rid=random();
  await pending().insert({...a,id:rid,workspaceId:'system',expiresAt:new Date(Date.now()+10*60_000).toISOString()});
  // No account content; remove expired pending requests, bounded by the store implementation.
  await pending().purgeSystemBefore('expiresAt',new Date().toISOString(),100).catch(()=>undefined);
  return redirect(`${ISSUER}${PATH}?request=${rid}`);
 }
 if(!opaque(rid))throw new OAuthError('invalid_request','Invalid authorization request.');
 const row=await pending().get('system',rid);
 if(!row||Date.parse(row.expiresAt)<=Date.now())throw new OAuthError('invalid_request','Connection request expired. Start connecting again in ChatGPT.');
 if(!await getSession(req.headers))return redirect(`${ISSUER}/signin?next=${encodeURIComponent(`${PATH}?request=${rid}`)}`);
 const ws=await owner(req), nonce=random(), csrf=proof(rid,ws.userId!,ws.id,nonce);
 const write=row.scopes.includes('business:write');
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Keplar Business to ChatGPT</title><style>body{margin:0;padding:48px 20px;background:#f5f5f5;color:#171717;font:16px/1.65 system-ui}main{max-width:480px;margin:auto;background:white;padding:36px;border:1px solid #ddd;border-radius:20px}img{width:56px;height:56px}h1{font-size:26px;line-height:1.25}p,li{color:#555}button{font:inherit;border:1px solid #ccc;border-radius:9px;padding:11px 20px;cursor:pointer}.connect{background:#111;color:white;margin-right:10px}.account{font-size:14px;overflow-wrap:anywhere}</style><main><img src="/business/icon.png" alt="Keplar Business"><h1>Connect Keplar Business to ChatGPT</h1><p class="account">${esc(ws.email||'')}<br>${esc(ws.name)}</p><p>Allow ChatGPT to:</p><ul><li>Read this workspace’s projects, tasks, saved reports, and agent status.</li>${write?'<li>Create projects and tasks, update task status, and save report drafts.</li>':''}</ul><p>This connection cannot send messages, spend money, publish sites, approve outbound actions, or change agent schedules. Treat content from your workspace as data, not instructions.</p><p>You can disconnect from ChatGPT or <a href="${ISSUER}/api/chatgpt/connections" target="_blank" rel="noopener">revoke this connection in Keplar</a> at any time.</p><form method="post" action="${PATH}"><input type="hidden" name="request" value="${rid}"><input type="hidden" name="csrf" value="${csrf}"><button class="connect" name="decision" value="allow">Connect</button><button name="decision" value="deny">Cancel</button></form></main></html>`;
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-frame-options':'DENY','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'set-cookie':`${COOKIE}=${nonce}; Path=${PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=600`}});
 }catch(e){return failure(e);}}
export async function authorizePost(req:Request){try{
 issuerOnly(req);assertSameOrigin(req);if(req.headers.get('origin')!==ISSUER)throw new HttpError(403,'Invalid consent origin.');await limit(req);
 const ws=await owner(req), q=await form(req), rid=q.get('request'), nonce=cookieValue(req.headers,COOKIE);
 if(!opaque(rid)||!opaque(nonce)||q.get('csrf')!==proof(rid,ws.userId!,ws.id,nonce))throw new HttpError(403,'Consent expired. Start connecting again in ChatGPT.');
 const row=await pending().get('system',rid);
 if(!row||Date.parse(row.expiresAt)<=Date.now())throw new OAuthError('invalid_request','Request expired.');
 if(!['allow','deny'].includes(q.get('decision')||''))throw new OAuthError('invalid_request','Choose Connect or Cancel.');
 if(!await pending().remove('system',rid))throw new OAuthError('invalid_request','Request already handled.');
 const cb=new URL(row.redirectUri);cb.searchParams.set('state',row.state);cb.searchParams.set('iss',ISSUER);
 if(q.get('decision')==='deny')cb.searchParams.set('error','access_denied');
 else cb.searchParams.set('code',await issueCode(stores(),row,{workspaceId:ws.id,userId:ws.userId!}));
 return redirect(cb.href,`${COOKIE}=; Path=${PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
 }catch(e){return failure(e);}}
export async function tokenPost(req:Request){try{issuerOnly(req);await limit(req);return oauthJson(await exchange(stores(),await form(req),RESOURCE));}catch(e){return failure(e);}}
export async function revokePost(req:Request){try{issuerOnly(req);await limit(req);const q=await form(req);await revoke(stores(),q.get('token'),q.get('client_id'));return oauthJson({});}catch(e){return failure(e);}}
export const preflight=()=>new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type, Authorization','cache-control':'no-store'}});
