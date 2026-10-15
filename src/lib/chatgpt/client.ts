import { CHATGPT_CLIENT, CHATGPT_REDIRECT, OAuthError } from './core';
let checkedUntil = 0;
/** Fixed HTTPS URL only: never fetch a model- or request-supplied client_id. */
export async function verifyChatGPTClient() {
 if(checkedUntil>Date.now())return;
 const r=await fetch(CHATGPT_CLIENT,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw new OAuthError('invalid_client','ChatGPT client metadata is unavailable.',503);
 const reader=r.body?.getReader();if(!reader)throw new OAuthError('invalid_client','Empty client metadata.',503);
 let text='',bytes=0;const decoder=new TextDecoder();
 try {for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>16384)throw new Error('Too large');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}catch{await reader.cancel();throw new OAuthError('invalid_client','Invalid client metadata.',503);}
 let d:Record<string,unknown>;try{d=JSON.parse(text);}catch{throw new OAuthError('invalid_client','Invalid client metadata.',503);}
 const methods=Array.isArray(d.token_endpoint_auth_methods_supported)?d.token_endpoint_auth_methods_supported:[d.token_endpoint_auth_method];
 if(d.client_id!==CHATGPT_CLIENT||!Array.isArray(d.redirect_uris)||!d.redirect_uris.includes(CHATGPT_REDIRECT)||!methods.includes('none'))throw new OAuthError('invalid_client','The published ChatGPT client metadata did not match.',503);
 checkedUntil=Date.now()+300_000;
}
