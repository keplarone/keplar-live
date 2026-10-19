import { getChatGPTUser } from "./chatgpt-auth";
import GatherApp from "./gather-app";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getChatGPTUser();
  return <GatherApp user={user ? { displayName: user.displayName, email: user.email } : null} />;
}
