"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { StatusScreen } from "@/components/status/StatusScreen";
import { reportClientError } from "@/components/status/report";
import { brand } from "@/lib/site";

/** Route-level error boundary: a calm retry state instead of a blank page. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Report to the error tracker (scrubbed, rate limited server-side). Best effort: never throws.
  useEffect(() => reportClientError(error), [error]);
  return (
    <StatusScreen
      title="Something went wrong."
      actions={<>
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="quiet">Back to Keplar</ButtonLink>
      </>}
      help={<>Still stuck? Tell us at <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>{error.digest ? <> and quote reference <code>{error.digest}</code></> : null}.</>}
    >
      That page failed to load. Try again, or head back home.
    </StatusScreen>
  );
}
