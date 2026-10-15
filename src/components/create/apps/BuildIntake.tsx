"use client";
import { BUILD_TYPES, BUILD_AUDIENCES, BUILD_PRIORITIES, EMPTY_INTAKE, type BuildIntake as Intake } from "./build-intake";
import s from "./studio.module.css";

export function BuildIntake({ value, onChange }: { value: Intake; onChange: (value: Intake) => void }) {
  const questions = [
    { key: "type", label: "What are we making?", choices: BUILD_TYPES },
    { key: "audience", label: "Who is it for?", choices: BUILD_AUDIENCES },
    { key: "priority", label: "What matters first?", choices: BUILD_PRIORITIES },
  ] as const;
  return <div className={s.intake}>
    <p className={s.intakeHint}>Three quick choices. Skip any if your description already covers it.</p>
    {questions.map(({ key, label, choices }) => <fieldset key={key} className={s.intakeQuestion}>
      <legend>{label}</legend>
      <div className={s.briefChips}>{choices.map((choice) => <button type="button" key={choice} className={s.calmChip} aria-pressed={value[key] === choice} onClick={() => onChange({ ...value, [key]: value[key] === choice ? "" : choice })}>{choice}</button>)}</div>
    </fieldset>)}
    {Object.values(value).some(Boolean) && <button type="button" className={s.textBtn} onClick={() => onChange({ ...EMPTY_INTAKE })}>Clear choices</button>}
  </div>;
}
