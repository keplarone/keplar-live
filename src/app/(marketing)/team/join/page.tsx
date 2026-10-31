import { pageMeta } from "@/lib/seo";
import { JoinTeam } from "@/components/account/JoinTeam";
import s from "@/components/account/account.module.css";

export const metadata = pageMeta("/team/join", "Join a team", "Accept an invitation to a Keplar team workspace.");

export default function JoinTeamPage() {
  return (
    <section className={s.page}>
      <div className={s.card}>
        <p className={s.eyebrow} data-o="account eyebrow">Team workspace · beta</p>
        <h1 className={s.title}>Join a team</h1>
        <JoinTeam />
      </div>
    </section>
  );
}
