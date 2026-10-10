import s from "@/components/app-ui/App.module.css";
import { KLoader } from "@/components/loader/KLoader";

/**
 * Arriving in /app: the empty shell (same boxes as AppLoader's fallback, so nothing jumps) with the loader fading in only
 * after 150ms, so a fast load never flashes it.
 */
export default function Loading() {
  return (
    <div className={s.app} aria-busy="true" aria-label="Loading Keplar">
      <div className={s.sideWrap} />
      <div className={s.main} style={{ display: "grid", placeItems: "center" }}>
        <span className="m-delayed"><KLoader size={24} label="Loading Keplar" /></span>
      </div>
    </div>
  );
}
