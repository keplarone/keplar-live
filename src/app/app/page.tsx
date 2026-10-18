import { permanentRedirect } from "next/navigation";
import { APP_HOME } from "@/components/app-ui/app-paths";

/** Bare /app opens the chat home. Query string is preserved by Next. next.config redirects /app here as well. */
export default function AppIndex() {
  permanentRedirect(APP_HOME);
}
