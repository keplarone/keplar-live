import { collection, storeDurable } from '@/lib/create/platform/store';
import { HttpError } from '@/lib/create/platform/http';
import type { Authorization, Code, Grant, Stores } from './core';
export type Pending = Authorization & { id:string;workspaceId:string;expiresAt:string };
export const pending = () => collection<Pending>('system_chatgpt_pending');
export const codes = () => collection<Code>('chatgpt_codes');
export const grants = () => collection<Grant>('chatgpt_grants');
export const stores = ():Stores => ({codes:codes(),grants:grants()});
export function requireStorage() {
 if(!storeDurable())throw new HttpError(503,'Connect a durable database before enabling the ChatGPT integration.','not_configured');
}
