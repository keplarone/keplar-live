import { JsonLd } from "@/components/seo/JsonLd";
import { softwareApp } from "@/lib/structuredData";
import { AppLoader } from "./AppLoader";
import { ExploreLinks } from "./ExploreLinks";
import s from "./ChatHome.module.css";

/**
 * The site home is the chat. This shell is server-rendered: a real heading, the app, and a footer of
 * links to the rest of Keplar. The app (client-only, it reads local threads) replaces the visual once it loads.
 */
export function ChatHome() {
  return (
    <div data-chat-home="">
      <h1 className={s.h1}>How can Keplar help you today?</h1>
      <AppLoader initialView="thread" retrievalEnabled={process.env.KEPLAR_RETRIEVAL_ENABLED === "true"} />
      <ExploreLinks className={s.crawl} />
      <JsonLd data={softwareApp()} />
    </div>
  );
}
