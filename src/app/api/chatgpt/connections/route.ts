import { requireAccount } from '@/lib/create/platform/workspace';
import { assertSameOrigin } from '@/lib/security/origin';
import { errorResponse, HttpError } from '@/lib/create/platform/http';
import { grants, requireStorage } from '@/lib/chatgpt/store';
import { ISSUER } from '@/lib/chatgpt/config';
import { boundedText } from '@/lib/chatgpt/oauth-http';
import { limitRequest } from '@/lib/create/platform/ratelimit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function GET(req:Request){try{
 requireStorage();const ws=await requireAccount(req);
 const list=(await grants().list(ws.id)).filter(g=>Date.parse(g.refreshExpiresAt)>Date.now());
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ChatGPT connections — Keplar Business</title><style>body{font:16px/1.7 system-ui;max-width:650px;margin:48px auto;padding:20px}article{padding:20px;border:1px solid #ccc;border-radius:12px;margin:20px 0}button{font:inherit;padding:8px 14px}small{color:#666}</style><h1>ChatGPT connections</h1><p>${esc(ws.email||'')}</p><p>Revoking signs this connection out immediately.</p>${list.length?list.map(g=>`<article><strong>Keplar Business for ChatGPT</strong><p><small>Connected or refreshed ${esc(g.createdAt)}<br>Permissions: ${esc(g.scopes.join(', '))}</small></p><form method="post"><input type="hidden" name="id" value="${esc(g.id)}"><button>Revoke connection</button></form></article>`).join(''):'<p>No active connections.</p>'}</html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
 }catch(e){return errorResponse(e);}}
export async function POST(req:Request){try{
 assertSameOrigin(req);if(req.headers.get('origin')!==ISSUER)throw new HttpError(403,'Invalid request origin.');
 requireStorage();const ws=await requireAccount(req);
 await limitRequest(req,'chatgpt_connections_revoke',{perIp:30,perAccount:30,accountId:ws.id});
 const id=new URLSearchParams(await boundedText(req)).get('id');if(!id)throw new HttpError(400,'Connection id required.');
 await grants().remove(ws.id,id);
 return new Response(null,{status:303,headers:{location:`${ISSUER}/api/chatgpt/connections`,'cache-control':'no-store'}});
 }catch(e){return errorResponse(e);}}
