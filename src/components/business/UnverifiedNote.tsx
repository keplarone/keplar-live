import { UNVERIFIED_NOTE } from "@/lib/business/verification";

/** Honest status line shown above connectors and connected apps (see src/lib/business/verification.ts). Styling comes from the caller. */
export function UnverifiedNote({ className }: { className?: string }) {
  return (
    <div className={className} role="note" data-testid="unverified-note">
      {UNVERIFIED_NOTE}
    </div>
  );
}
