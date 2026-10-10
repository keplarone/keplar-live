/** Test helper (run with tsx): `set-plan.ts <email> <plan>` puts that account's workspace on a plan in the throwaway store. */
import { updateWorkspace, workspaceForEmail } from "@/lib/accounts/workspaces";

async function main() {
  const [email, plan] = process.argv.slice(2);
  const ws = await workspaceForEmail(email);
  if (!ws) { console.error(`no workspace for ${email}`); process.exit(2); }
  await updateWorkspace(ws.id, { plan: plan as never });
  console.log(`${email} -> ${plan}`);
}
void main();
