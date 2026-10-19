import { tabMeta, TabPage } from "../_tab";

export const metadata = tabMeta("tasks");

export default function Page() {
  return <TabPage view="tasks" />;
}
