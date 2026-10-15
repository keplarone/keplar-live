import { workspaceById, type Workspace } from '@/lib/create/platform/workspace';
import { clientIpOf, rateLimit } from '@/lib/create/platform/ratelimit';
import { OAuthError, authenticate } from './core';
import { challenge, RESOURCE } from './config';
import { requireStorage, stores } from './store';
import { execute } from './operations';
import { handleMcp } from './transport';
export async function mcpPost(req:Request){
 let ws:Workspace|null=null;let scopes:string[]=[];
 return handleMcp(req,{challenge,authorize:async(scope)=>{
  requireStorage();await rateLimit(`chatgpt:ip:${clientIpOf(req)}`,120,60,{shared:true});
  const g=await authenticate(stores(),req.headers.get('authorization'),RESOURCE,scope);
  ws=await workspaceById(g.workspaceId);
  // Recheck ownership and current plan on every call; a deleted account or lapsed plan cannot ride an old grant.
  if(!ws||ws.userId!==g.userId||!ws.verified)throw new OAuthError('invalid_token','The connected workspace is no longer available.',401);
  if(ws.plan!=='business'&&!ws.admin)throw new OAuthError('insufficient_scope','An active Keplar Business plan is required.',403);
  await rateLimit(`chatgpt:workspace:${ws.id}`,Math.min(ws.entitlements.rpm,600),60,{shared:true});scopes=g.scopes;
 },execute:async(name,args)=>execute(ws!,scopes,name,args)});
}
