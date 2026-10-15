import type { Workspace } from '@/lib/create/platform/workspace';
import { HttpError } from '@/lib/create/platform/http';
import { listProjects, requireProject, saveProject } from '@/lib/projects/repo';
import { addTask, tasks, updateTask } from '@/lib/business/workspace-data';
import { reportsStore, saveReport } from '@/lib/business/reports';
import { agents, runs, audit } from '@/lib/business/repo';
import { READ, WRITE } from './core';
import { validateArgs } from './tools';
export async function execute(ws:Workspace, scope:string[], name:string, input:unknown) {
 const a=validateArgs(name,input);
 if(!scope.includes(READ)||(['create_project','create_task','update_task','save_report'].includes(name)&&!scope.includes(WRITE)))throw new HttpError(403,'Connect with business:write to save changes.','insufficient_scope');
 const pid=typeof a.project_id==='string'?a.project_id:null;
 if(pid)await requireProject(ws.id,pid);
 let result:unknown;
 switch(name){
 case 'get_account':return {id:ws.id,name:ws.name,email:ws.email,plan:ws.plan,url:'https://business.keplar.one/work'};
 case 'list_projects':return {projects:await listProjects(ws.id)};
 case 'get_project':return {project:await requireProject(ws.id,pid!),tasks:await tasks().list(ws.id,t=>t.projectId===pid),reports:(await reportsStore().list(ws.id,r=>r.projectId===pid)).map(({id,title,createdAt})=>({id,title,createdAt}))};
 case 'create_project':result=await saveProject(ws.id,{name:a.name,instructions:a.instructions});break;
 case 'create_task':result=await addTask(ws.id,pid!,{title:a.title,due:a.due});break;
 case 'update_task':{
  const task=await tasks().get(ws.id,String(a.task_id));if(!task)throw new HttpError(404,'Task not found.');
  await requireProject(ws.id,task.projectId);result=await updateTask(ws.id,task.id,{title:a.title,status:a.status,due:a.due});break;
 }
 case 'list_reports':return {reports:(await reportsStore().list(ws.id,r=>!pid||r.projectId===pid)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100).map(({id,title,kind,projectId,createdAt})=>({id,title,kind,projectId,createdAt}))};
 case 'get_report':{const r=await reportsStore().get(ws.id,String(a.report_id));if(!r)throw new HttpError(404,'Report not found.');return {report:r};}
 case 'save_report':result=await saveReport(ws.id,{title:a.title,markdown:a.markdown,projectId:pid,template:'chatgpt',kind:'reason'});break;
 case 'list_agents':{
  const list=await agents().list(ws.id);
  return {agents:list.map(({id,name,trigger,status,lastRunAt})=>({id,name,trigger,status,lastRunAt})),recentRuns:(await runs().list(ws.id)).sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,20),scheduling:'Read-only view. Check the Agents panel in Keplar for scheduler driver health and effective cadence.'};
 }
 default:throw new HttpError(400,'Unknown tool.');
 }
 await audit(ws.id,'chatgpt',`chatgpt.${name}`);
 return result;
}
