import { brand } from "@/lib/site";
import { KeplarSymbol } from "@/components/brand";
import s from "./Legal.module.css";

const steps = [
  { name: "You", note: "Prompt and files" },
  { name: "Keplar", note: "Classifies, selects models" },
  { name: "Selected model providers", note: "Only those chosen for this request" },
  { name: `${brand.engineName} synthesis`, note: "Compares, weighs the evidence, writes one answer" },
  { name: "You", note: "One answer, with its consensus" },
];

/**
 * Static diagram of the AI data flow. The model step is drawn as several
 * parallel lanes because a request can go to more than one provider.
 */
export function DataFlow() {
  return (
    <figure className={s.flow}>
      <ol className={s.flowSteps}>
        {steps.map((st, i) => (
          <li key={i} className={s.flowStep} data-kind={i === 2 ? "providers" : i === 3 ? "keplar" : undefined}>
            <span className={s.flowIndex} aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            <span className={s.flowNode} aria-hidden="true">
              {i === 2 ? (
                <span className={s.flowLanes}>
                  <i />
                  <i />
                  <i />
                </span>
              ) : i === 1 || i === 3 ? (
                <KeplarSymbol size={14} />
              ) : (
                <span className={s.flowDot} />
              )}
            </span>
            <span className={s.flowName}>{st.name}</span>
            <span className={s.flowNote}>{st.note}</span>
          </li>
        ))}
      </ol>
      <figcaption className={s.flowCaption}>How a request moves: from you, through Keplar and the model providers it selects, back to you as one answer.</figcaption>
    </figure>
  );
}
