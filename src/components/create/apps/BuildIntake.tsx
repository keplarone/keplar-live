"use client";
import { useState } from "react";
import { BUILD_TYPES, BUILD_AUDIENCES, BUILD_PRIORITIES, EMPTY_INTAKE, type BuildIntake as Intake } from "./build-intake";
import s from "./studio.module.css";

const QUESTIONS = [
  { key: "type", label: "What are we making?", choices: BUILD_TYPES },
  { key: "audience", label: "Who is it for?", choices: BUILD_AUDIENCES },
  { key: "priority", label: "What matters first?", choices: BUILD_PRIORITIES },
] as const;

/** One optional question at a time: picking or skipping moves to the next; when all are done only a one-line summary remains. */
export function BuildIntake({ value, onChange }: { value: Intake; onChange: (value: Intake) => void }) {
  const [step, setStep] = useState(0);
  const q = QUESTIONS[step];
  const picked = QUESTIONS.map(({ key }) => value[key]).filter(Boolean);

  if (!q) {
    if (!picked.length) return null;
    return <div className={s.intakeDone}>
      <span>{picked.join(" · ")}</span>
      <button type="button" className={s.textBtn} onClick={() => { onChange({ ...EMPTY_INTAKE }); setStep(0); }}>Change</button>
    </div>;
  }

  return <fieldset className={s.intakeQuestion} aria-describedby="intake-step">
    <legend>{q.label} <span id="intake-step" className={s.intakeStep}>{step + 1} of {QUESTIONS.length}</span></legend>
    <div className={s.briefChips}>
      {q.choices.map((choice) => <button type="button" key={choice} className={s.calmChip} aria-pressed={value[q.key] === choice} onClick={() => { onChange({ ...value, [q.key]: choice }); setStep(step + 1); }}>{choice}</button>)}
      <button type="button" className={s.textBtn} onClick={() => setStep(step + 1)}>Skip</button>
    </div>
  </fieldset>;
}
