"use client";
/**
 * Connected apps (MCP) for the signed-in Keplar account, inside the Keplar One app (/app/apps). The same screen Keplar
 * Business shows (src/components/business/McpConnections.tsx, account-level /api/mcp), so "Manage" in Ask's Tools bar opens
 * it here instead of sending people to the Business site. Calls that wait for approval are listed below it.
 */
import { useState } from "react";
import { McpConnections } from "@/components/business/McpConnections";
import { loadPendingMcpApprovals } from "@/components/business/mcp-pending";
import type { ToolUse } from "@/lib/orchestration/types";
import { ToolUses } from "./ToolUses";
import s from "./App.module.css";

export function ConnectedAppsView() {
  const [pending, setPending] = useState<ToolUse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showPending = () => {
    setError(null);
    loadPendingMcpApprovals().then(setPending, (e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load pending approvals."));
  };
  return (
    <div className={s.view} data-connected-apps="">
      <header className={s.viewHead}>
        <div>
          <h1 className={s.viewTitle}>Connected apps</h1>
          <p className={s.viewLede}>Apps Ask can use when you switch Tools on in a chat. You decide what each tool may do.</p>
        </div>
      </header>
      <McpConnections go={showPending} onChange={() => undefined} />
      {error ? <p role="alert">{error}</p> : null}
      {pending ? (
        <section aria-labelledby="apps-pending-h">
          <h2 id="apps-pending-h">Waiting for your approval</h2>
          {pending.length ? <ToolUses uses={pending} /> : <p>Nothing is waiting.</p>}
        </section>
      ) : null}
    </div>
  );
}
