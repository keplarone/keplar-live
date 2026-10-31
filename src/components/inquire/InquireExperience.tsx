"use client";

import { KLoader } from "@/components/loader/KLoader";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BUSINESS,
  companySizes,
  completedFields,
  estimatedUsers,
  expectedUsage,
  fieldOrder,
  interests,
  limits,
  totalFields,
  useCases,
  validate,
  type FieldErrors,
  type Inquiry,
  type InquiryField,
} from "@/lib/inquire/schema";
import { ConvergenceField } from "./ConvergenceField";
import { inquireCopy as copy } from "./content";
import s from "./Inquire.module.css";

type Status = "idle" | "submitting" | "success" | "error";

const empty: Inquiry = {
  name: "",
  email: "",
  company: "",
  companySize: "",
  interests: [],
  message: "",
  business: { handle: "", estimatedUsers: "", useCase: "", expectedUsage: "" },
};

const fieldLabel: Record<InquiryField, string> = {
  name: "Name",
  email: "Work Email",
  company: "Company",
  companySize: "Company Size",
  interests: "I’m interested in",
  message: "What are you looking to accomplish?",
  handle: "What would you like Keplar to handle?",
  estimatedUsers: "Estimated users",
  useCase: "Primary use case",
  expectedUsage: "Expected usage",
};

export function InquireExperience() {
  const uid = useId();
  const [values, setValues] = useState<Inquiry>(empty);
  const [touched, setTouched] = useState<Partial<Record<InquiryField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  const business = values.interests.includes(BUSINESS);
  const errors = useMemo(() => ({ ...validate(values), ...serverErrors }), [values, serverErrors]);
  const shown = (f: InquiryField) => ((touched[f] || submitted) && errors[f] ? errors[f] : undefined);
  const completed = useMemo(() => completedFields(values), [values]);
  const total = totalFields(values);

  const set = <K extends keyof Inquiry>(key: K, v: Inquiry[K]) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    if (serverErrors[key as InquiryField]) setServerErrors((e) => ({ ...e, [key]: undefined }));
  };
  const setBiz = <K extends keyof NonNullable<Inquiry["business"]>>(key: K, v: NonNullable<Inquiry["business"]>[K]) =>
    setValues((prev) => ({ ...prev, business: { ...prev.business!, [key]: v } }));
  const touch = (f: InquiryField) => setTouched((t) => (t[f] ? t : { ...t, [f]: true }));

  const describedBy = (f: InquiryField, extra?: string) => [shown(f) ? `${uid}-${f}-err` : null, extra].filter(Boolean).join(" ") || undefined;

  const focusField = (f: InquiryField) => {
    const el = document.querySelector<HTMLElement>(`[data-focus-field="${f}"]`);
    el?.focus();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    setSubmitted(true);
    setServerMessage(null);
    const errs = validate(values);
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setStatus("submitting");
    const payload = {
      ...values,
      business: business ? values.business : undefined,
      website: honeypot.current?.value ?? "",
    };
    try {
      const res = await fetch("/api/inquire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; fields?: FieldErrors };
      if (res.ok && body.ok) {
        setResolved(true);
        setStatus("success");
        return;
      }
      if (body.fields) setServerErrors(body.fields);
      setServerMessage(body.error ?? "We couldn’t send your inquiry. Please try again.");
      setStatus("error");
    } catch {
      setServerMessage("We couldn’t reach Keplar. Check your connection and try again.");
      setStatus("error");
    }
  };

  // Move focus to the confirmation once it renders.
  useEffect(() => {
    if (status !== "success") return;
    const el = successRef.current;
    el?.focus();
    el?.closest("section")?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [status]);

  const reset = useCallback(() => {
    setValues(empty);
    setTouched({});
    setSubmitted(false);
    setServerErrors({});
    setResolved(false);
    setStatus("idle");
  }, []);

  const summaryErrors = submitted ? fieldOrder.filter((f) => errors[f]) : [];

  return (
    <div className={s.page}>
      <ConvergenceField completed={completed} total={total} resolved={resolved} />

      <div className={s.grid}>
        <header className={s.intro}>
          <p className={s.eyebrow} data-o="Inquire eyebrow">{copy.eyebrow}</p>
          <h1 className={s.title}>{copy.title}</h1>
          <p className={s.lede}>{copy.lede}</p>
          <div className={s.anchorWrap} aria-hidden="true">
            <div className={s.anchor} data-converge-anchor="primary" />
            <p className={s.progress}>
              {status === "success" ? (
                <span className={s.progressCount}>Received</span>
              ) : (
                <>
                  <span className={s.progressCount}>{completed.length}</span>
                  <span> of {total}</span>
                  <span className={s.progressLabel}>Converging</span>
                </>
              )}
            </p>
          </div>
        </header>

        {status === "success" ? (
          <section className={`${s.card} ${s.success}`} aria-labelledby={`${uid}-success`}>
            <div className={s.successMark} data-converge-anchor="success" aria-hidden="true" />
            <h2 id={`${uid}-success`} ref={successRef} tabIndex={-1} className={s.successTitle}>
              {copy.successTitle}
            </h2>
            <p className={s.successBody}>{copy.successBody}</p>
            <div className={s.successActions}>
              <Link href="/" className={s.quietLink}>Back to Keplar</Link>
              <button type="button" className={s.quietLink} onClick={reset}>Send another inquiry</button>
            </div>
          </section>
        ) : (
          <form className={s.card} onSubmit={onSubmit} noValidate aria-busy={status === "submitting"} aria-describedby={`${uid}-micro`}>
            {summaryErrors.length ? (
              <div ref={summaryRef} className={s.summary} role="alert" tabIndex={-1}>
                <p className={s.summaryTitle}>
                  {summaryErrors.length === 1 ? "One field needs attention." : `${summaryErrors.length} fields need attention.`}
                </p>
                <ul>
                  {summaryErrors.map((f) => (
                    <li key={f}>
                      <a href={`#${uid}-${f}`} onClick={(e) => { e.preventDefault(); focusField(f); }}>
                        {fieldLabel[f]}: {errors[f]}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className={s.row2}>
              <div className={s.field} data-stream-field="name" data-invalid={!!shown("name") || undefined}>
                <label htmlFor={`${uid}-name`} className={s.label}>Name</label>
                <input
                  id={`${uid}-name`}
                  data-focus-field="name"
                  className={s.input}
                  autoComplete="name"
                  value={values.name}
                  maxLength={limits.name}
                  onChange={(e) => set("name", e.target.value)}
                  onBlur={() => touch("name")}
                  aria-invalid={!!shown("name")}
                  aria-describedby={describedBy("name")}
                  required
                />
                <FieldError id={`${uid}-name-err`} msg={shown("name")} />
              </div>
              <div className={s.field} data-stream-field="email" data-invalid={!!shown("email") || undefined}>
                <label htmlFor={`${uid}-email`} className={s.label}>Work Email</label>
                <input
                  id={`${uid}-email`}
                  data-focus-field="email"
                  className={s.input}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  spellCheck={false}
                  value={values.email}
                  maxLength={limits.email}
                  onChange={(e) => set("email", e.target.value)}
                  onBlur={() => touch("email")}
                  aria-invalid={!!shown("email")}
                  aria-describedby={describedBy("email")}
                  required
                />
                <FieldError id={`${uid}-email-err`} msg={shown("email")} />
              </div>
            </div>

            <div className={s.field} data-stream-field="company" data-invalid={!!shown("company") || undefined}>
              <label htmlFor={`${uid}-company`} className={s.label}>
                Company {values.companySize === "Just me" ? <span className={s.optional}>Optional</span> : null}
              </label>
              <input
                id={`${uid}-company`}
                data-focus-field="company"
                className={s.input}
                autoComplete="organization"
                value={values.company}
                maxLength={limits.company}
                onChange={(e) => set("company", e.target.value)}
                onBlur={() => touch("company")}
                aria-invalid={!!shown("company")}
                aria-describedby={describedBy("company")}
              />
              <FieldError id={`${uid}-company-err`} msg={shown("company")} />
            </div>

            <fieldset className={s.fieldset} data-stream-field="companySize" aria-describedby={describedBy("companySize")} aria-invalid={!!shown("companySize") || undefined}>
              <legend className={s.label} id={`${uid}-companySize`}>Company Size</legend>
              <div className={s.segmented}>
                {companySizes.map((opt, i) => (
                  <label key={opt} className={s.segment}>
                    <input
                      type="radio"
                      name="companySize"
                      value={opt}
                      checked={values.companySize === opt}
                      onChange={() => { set("companySize", opt); touch("companySize"); }}
                      data-focus-field={i === 0 ? "companySize" : undefined}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              <FieldError id={`${uid}-companySize-err`} msg={shown("companySize")} />
            </fieldset>

            <fieldset className={s.fieldset} data-stream-field="interests" aria-describedby={describedBy("interests", `${uid}-interests-hint`)}>
              <legend className={s.label} id={`${uid}-interests`}>I&rsquo;m interested in</legend>
              <p id={`${uid}-interests-hint`} className="visually-hidden">Choose one or more.</p>
              <div className={s.pills}>
                {interests.map((opt, i) => {
                  const on = values.interests.includes(opt);
                  return (
                    <label key={opt} className={s.pill}>
                      <input
                        type="checkbox"
                        value={opt}
                        checked={on}
                        onChange={() => {
                          set("interests", on ? values.interests.filter((x) => x !== opt) : [...values.interests, opt]);
                          touch("interests");
                        }}
                        data-focus-field={i === 0 ? "interests" : undefined}
                        aria-controls={opt === BUSINESS ? `${uid}-business` : undefined}
                      />
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>
              <FieldError id={`${uid}-interests-err`} msg={shown("interests")} />
            </fieldset>

            <div id={`${uid}-business`} className={s.reveal} data-open={business || undefined} inert={!business || undefined}>
              <div className={s.revealInner}>
                <div className={s.business}>
                  <p className={s.businessTitle}>Keplar Business</p>

                  <div className={s.field} data-stream-field={business ? "handle" : undefined}>
                    <label htmlFor={`${uid}-handle`} className={s.label}>
                      What would you like Keplar to handle? <span className={s.optional}>Optional</span>
                    </label>
                    <textarea
                      id={`${uid}-handle`}
                      data-focus-field="handle"
                      className={`${s.input} ${s.textareaSm}`}
                      rows={2}
                      value={values.business?.handle ?? ""}
                      maxLength={limits.handle}
                      onChange={(e) => setBiz("handle", e.target.value)}
                    />
                  </div>

                  <fieldset className={s.fieldset} data-stream-field={business ? "estimatedUsers" : undefined} aria-describedby={describedBy("estimatedUsers")}>
                    <legend className={s.label} id={`${uid}-estimatedUsers`}>Estimated users</legend>
                    <div className={s.segmented}>
                      {estimatedUsers.map((opt, i) => (
                        <label key={opt} className={s.segment}>
                          <input
                            type="radio"
                            name="estimatedUsers"
                            value={opt}
                            checked={values.business?.estimatedUsers === opt}
                            onChange={() => { setBiz("estimatedUsers", opt); touch("estimatedUsers"); }}
                            data-focus-field={i === 0 ? "estimatedUsers" : undefined}
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                    <FieldError id={`${uid}-estimatedUsers-err`} msg={shown("estimatedUsers")} />
                  </fieldset>

                  <div className={s.row2}>
                    <div className={s.field} data-stream-field={business ? "useCase" : undefined} data-invalid={!!shown("useCase") || undefined}>
                      <label htmlFor={`${uid}-useCase`} className={s.label}>Primary use case</label>
                      <select
                        id={`${uid}-useCase`}
                        data-focus-field="useCase"
                        className={`${s.input} ${s.select}`}
                        value={values.business?.useCase ?? ""}
                        onChange={(e) => { setBiz("useCase", e.target.value as NonNullable<Inquiry["business"]>["useCase"]); touch("useCase"); }}
                        onBlur={() => touch("useCase")}
                        aria-invalid={!!shown("useCase")}
                        aria-describedby={describedBy("useCase")}
                      >
                        <option value="">Choose one</option>
                        {useCases.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <FieldError id={`${uid}-useCase-err`} msg={shown("useCase")} />
                    </div>
                    <div className={s.field} data-stream-field={business ? "expectedUsage" : undefined}>
                      <label htmlFor={`${uid}-expectedUsage`} className={s.label}>
                        Expected usage <span className={s.optional}>Optional</span>
                      </label>
                      <select
                        id={`${uid}-expectedUsage`}
                        data-focus-field="expectedUsage"
                        className={`${s.input} ${s.select}`}
                        value={values.business?.expectedUsage ?? ""}
                        onChange={(e) => setBiz("expectedUsage", e.target.value as NonNullable<Inquiry["business"]>["expectedUsage"])}
                      >
                        <option value="">Choose one</option>
                        {expectedUsage.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={s.field} data-stream-field="message" data-invalid={!!shown("message") || undefined}>
              <label htmlFor={`${uid}-message`} className={s.label}>What are you looking to accomplish?</label>
              <textarea
                id={`${uid}-message`}
                data-focus-field="message"
                className={`${s.input} ${s.textarea}`}
                rows={5}
                placeholder={copy.messagePlaceholder}
                value={values.message}
                maxLength={limits.message}
                onChange={(e) => set("message", e.target.value)}
                onBlur={() => touch("message")}
                aria-invalid={!!shown("message")}
                aria-describedby={describedBy("message")}
                required
              />
              <FieldError id={`${uid}-message-err`} msg={shown("message")} />
            </div>

            {/* Honeypot for bots; hidden from people and assistive tech. */}
            <div className={s.hp} aria-hidden="true">
              <label>
                Website
                <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            {status === "error" && serverMessage ? (
              <p className={s.serverError} role="alert">{serverMessage}</p>
            ) : null}

            <div className={s.submitRow}>
              <button type="submit" className={s.submit} disabled={status === "submitting"}>
                <span>{status === "submitting" ? "Sending…" : copy.cta}</span>
                <span className={s.arrow} aria-hidden="true">{status === "submitting" ? <KLoader size={18} tone="current" label="Sending" /> : "→"}</span>
              </button>
              <p id={`${uid}-micro`} className={s.micro}>{copy.microcopy}</p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function FieldError({ id, msg }: { id: string; msg?: string }) {
  return msg ? (
    <p id={id} className={s.error}>
      {msg}
    </p>
  ) : null;
}
