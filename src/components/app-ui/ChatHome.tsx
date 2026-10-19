import { JsonLd } from "@/components/seo/JsonLd";
import { softwareApp } from "@/lib/structuredData";
import { site } from "@/lib/site";
import { AppLoader } from "./AppLoader";
import { ExploreLinks } from "./ExploreLinks";
import s from "./ChatHome.module.css";

/**
 * The site home is the chat. This shell is server-rendered: a real heading, one line on what Keplar does, the app, and a footer
 * of links to the rest of Keplar. The app (client-only, it reads local threads) replaces the visual once it loads.
 */
export function ChatHome() {
  return (
    <div data-chat-home="">
      <h1 className={s.h1}>How can Keplar help you today?</h1>
      <p className={s.lede}>{site.summary} Free to try, no signup.</p>
      <AppLoader initialView="thread" />
      <ExploreLinks className={s.crawl} />
      <JsonLd data={softwareApp()} />
    </div>
  );
}
