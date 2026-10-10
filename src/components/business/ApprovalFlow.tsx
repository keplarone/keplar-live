import { approvalFlow } from "@/lib/business/flow";
import s from "./approval-flow.module.css";

/** Action -> risk -> cost -> permission -> outcome, from the real stored approval. */
export function ApprovalFlow({ approval }: { approval: Parameters<typeof approvalFlow>[0] }) {
  const steps = approvalFlow(approval);
  return (
    <ol className={s.flow} aria-label="Path of this action">
      {steps.map((st) => (
        <li key={st.id} className={s.step} data-tone={st.tone} data-reached={st.reached || undefined}>
          <span className={s.node} aria-hidden="true" />
          <span className={s.title}>{st.title}</span>
          <span className={s.detail}>{st.detail}</span>
        </li>
      ))}
    </ol>
  );
}
