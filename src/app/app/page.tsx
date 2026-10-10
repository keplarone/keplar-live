import { permanentRedirect } from "next/navigation";
import { APP_HOME } from "@/components/app-ui/app-paths";

/** Bare /app redirects to /app/ask. Query string is preserved by Next. */
export default function AppIndex() {
  permanentRedirect(APP_HOME);
}
