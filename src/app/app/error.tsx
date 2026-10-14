"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { StatusScreen } from "@/components/status/StatusScreen";
import { reportClientError } from "@/components/status/report";
import { brand } from "@/lib/site";

/**
 * A crash inside the app: the workspace view failed, not the account. Says what is safe (saved chats live on the server or in this
 * browser and are untouched), retries the view in place, and offers a clean new chat as the way out. Without this boundary a
 * crash here fell through to the website's generic error page.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error), [error]);
  return (
    <StatusScreen
      as="div"
      fill
      title="This view stopped working."
      actions={<>
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/app" variant="secondary">Start a new chat</ButtonLink>
      </>}
      help={<>Your saved chats are safe. If this keeps happening, tell us at <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>{error.digest ? <> and quote reference <code>{error.digest}</code></> : null}.</>}
    >
      Something in Keplar failed while showing this screen. Trying again usually fixes it.
    </StatusScreen>
  );
}
