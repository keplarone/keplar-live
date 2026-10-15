/** OAuth primitives shared by the HTTP adapter and tests. No browser cookies authenticate MCP calls. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const CHATGPT_CLIENT = 'https://chatgpt.com/oauth/client.json';
export const CHATGPT_REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';
export const READ = 'business:read';
export const WRITE = 'business:write';
export const SCOPES = [READ, WRITE];
export const ACCESS_MS = 60 * 60_000;
export const REFRESH_MS = 30 * 86400_000;
export const CODE_MS = 2 * 60_000;
export const random = () => randomBytes(32).toString('base64url');
export const hash = (s: string) => createHash('sha256').update(s).digest('base64url');
export const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const opaque = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);

export class OAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export type Authorization = { clientId: string; redirectUri: string; challenge: string; state: string; resource: string; scopes: string[] };
export type Code = Authorization & { id: string; workspaceId: string; userId: string; expiresAt: string };
export type Grant = { id: string; workspaceId: string; userId: string; clientId: string; resource: string; scopes: string[]; tokenHash: string; refreshHash: string; createdAt: string; expiresAt: string; refreshExpiresAt: string };
export interface Store<T extends {id:string;workspaceId:string}> {
  insert(row: T): Promise<T>;
  findSystemBy(field:string,value:string):Promise<T|null>;
  get(ws:string,id:string):Promise<T|null>;
  remove(ws:string,id:string):Promise<boolean>;
}
export type Stores = { codes: Store<Code>; grants: Store<Grant> };
const invalid = () => new OAuthError('invalid_grant', 'The grant is invalid, expired, or already used. Reconnect Keplar Business.');
export function scopesOf(raw: unknown): string[] {
  const s = typeof raw === 'string' && raw.trim() ? [...new Set(raw.trim().split(/\s+/))] : [READ];
  if (!s.includes(READ) || s.some(v => !SCOPES.includes(v))) throw new OAuthError('invalid_scope', 'Use business:read, optionally with business:write.');
  return s;
}
export function authorization(q: URLSearchParams, resource: string): Authorization {
  for (const k of ['client_id','redirect_uri','response_type','code_challenge','code_challenge_method','resource','scope','state']) if(q.getAll(k).length > 1) throw new OAuthError('invalid_request','Duplicate authorization parameter.');
  if(q.get('client_id')!==CHATGPT_CLIENT) throw new OAuthError('invalid_client','Only the published ChatGPT client is supported.');
  if(q.get('redirect_uri')!==CHATGPT_REDIRECT) throw new OAuthError('invalid_request','Unregistered redirect URI.');
  if(q.get('response_type')!=='code') throw new OAuthError('unsupported_response_type','Use the authorization code flow.');
  if(q.get('code_challenge_method')!=='S256' || !opaque(q.get('code_challenge'))) throw new OAuthError('invalid_request','PKCE S256 is required.');
  if(q.get('resource')!==resource) throw new OAuthError('invalid_target','The resource must be the Keplar Business MCP endpoint.');
  const state=q.get('state')||'';
  if(!state || state.length>2048) throw new OAuthError('invalid_request','A bounded state is required.');
  return {clientId:CHATGPT_CLIENT,redirectUri:CHATGPT_REDIRECT,challenge:q.get('code_challenge')!,state,resource,scopes:scopesOf(q.get('scope'))};
}
export async function issueCode(stores:Stores, a:Authorization, who:{workspaceId:string;userId:string}, now=Date.now()) {
  const code=random();
  await stores.codes.insert({...a,...who,id:hash(code),expiresAt:new Date(now+CODE_MS).toISOString()});
  return code;
}
async function mint(stores:Stores, g:Pick<Grant,'workspaceId'|'userId'|'clientId'|'resource'|'scopes'>, now:number) {
  const id=random(), access=random(), refresh=random();
  await stores.grants.insert({workspaceId:g.workspaceId,userId:g.userId,clientId:g.clientId,resource:g.resource,scopes:g.scopes,id,tokenHash:hash(access),refreshHash:hash(refresh),createdAt:new Date(now).toISOString(),expiresAt:new Date(now+ACCESS_MS).toISOString(),refreshExpiresAt:new Date(now+REFRESH_MS).toISOString()});
  return {token_type:'Bearer',access_token:`kb_at_${id}.${access}`,refresh_token:`kb_rt_${id}.${refresh}`,expires_in:ACCESS_MS/1000,scope:g.scopes.join(' ')};
}
export function parts(token:unknown,prefix:string): {id:string;secret:string}|null {
  if(typeof token!=='string'||!token.startsWith(prefix))return null;
  const [id,secret,...extra]=token.slice(prefix.length).split('.');
  return opaque(id)&&opaque(secret)&&!extra.length?{id,secret}:null;
}
export async function exchange(stores:Stores, q:URLSearchParams, resource:string, now=Date.now()) {
  for(const k of ['grant_type','client_id','code','redirect_uri','code_verifier','resource','refresh_token','scope']) if(q.getAll(k).length>1)throw new OAuthError('invalid_request','Duplicate token parameter.');
  if(q.get('client_id')!==CHATGPT_CLIENT)throw new OAuthError('invalid_client','Unknown client.');
  if(q.get('resource')!==resource)throw new OAuthError('invalid_target','Wrong resource.');
  if(q.get('grant_type')==='authorization_code') {
    const c=q.get('code'),v=q.get('code_verifier');
    if(!opaque(c)||typeof v!=='string'||!/^[A-Za-z0-9._~-]{43,128}$/.test(v))throw invalid();
    const row=await stores.codes.findSystemBy('id',hash(c));
    if(!row||Date.parse(row.expiresAt)<=now||row.clientId!==q.get('client_id')||row.redirectUri!==q.get('redirect_uri')||row.resource!==resource||!equal(row.challenge,hash(v)))throw invalid();
    if(!await stores.codes.remove(row.workspaceId,row.id))throw invalid();
    return mint(stores,row,now);
  }
  if(q.get('grant_type')==='refresh_token') {
    const p=parts(q.get('refresh_token'),'kb_rt_');if(!p)throw invalid();
    const row=await stores.grants.findSystemBy('id',p.id);
    if(!row||Date.parse(row.refreshExpiresAt)<=now||row.clientId!==q.get('client_id')||row.resource!==resource||!equal(row.refreshHash,hash(p.secret)))throw invalid();
    const scopes=q.has('scope')?scopesOf(q.get('scope')):row.scopes;
    if(scopes.some(s=>!row.scopes.includes(s)))throw new OAuthError('invalid_scope','Refresh cannot add permissions.');
    // Atomic DELETE: one refresh wins, and the previous access token is revoked immediately.
    if(!await stores.grants.remove(row.workspaceId,row.id))throw invalid();
    return mint(stores,{...row,scopes},now);
  }
  throw new OAuthError('unsupported_grant_type','Use authorization_code or refresh_token.');
}
export async function authenticate(stores:Stores, header:string|null, resource:string, scope=READ, now=Date.now()):Promise<Grant> {
  const raw=header?.match(/^Bearer\s+(\S+)\s*$/i)?.[1];const p=parts(raw,'kb_at_');
  if(!p)throw new OAuthError('invalid_token','Connect your Keplar Business account.',401);
  const row=await stores.grants.findSystemBy('id',p.id);
  if(!row||row.resource!==resource||row.clientId!==CHATGPT_CLIENT||Date.parse(row.expiresAt)<=now||!equal(row.tokenHash,hash(p.secret)))throw new OAuthError('invalid_token','Connection expired or revoked. Reconnect Keplar Business.',401);
  if(!row.scopes.includes(scope))throw new OAuthError('insufficient_scope','Reconnect with the required permission.',403);
  return row;
}
export async function revoke(stores:Stores, token:unknown, client:unknown) {
  if(client!==CHATGPT_CLIENT)throw new OAuthError('invalid_client','Unknown client.');
  const p=parts(token,'kb_at_')??parts(token,'kb_rt_');if(!p)return;
  const row=await stores.grants.findSystemBy('id',p.id);if(!row)return;
  const field=typeof token==='string'&&token.startsWith('kb_rt_')?'refreshHash':'tokenHash';
  if(equal(row[field],hash(p.secret)))await stores.grants.remove(row.workspaceId,row.id);
}
