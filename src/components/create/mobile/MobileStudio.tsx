"use client";
/**
 * Create > Mobile (BETA). Three folded steps (progressive disclosure): describe the app, connect store accounts, get the project.
 * Everything here is honest about what Apple and Google allow; keys are write-only.
 */
import { useEffect, useState } from "react";
import { api } from "../api";
import s from "./mobile.module.css";
import { CreateIntro } from "../CreateIntro";
import { ActivityIndicator, Button } from "@/components/kit";

type Cred = { kind: "apple" | "google" | "expo"; hint: string; status: "saved" | "verified" | "failed"; detail: string; checkedAt: string | null };
type Facts = Record<"apple" | "google" | "expo", { program: string; price: string; needs: string; api: string; review: string }> & { honesty: string };
type Screen = { title: string; body: string };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export function MobileStudio() {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [creds, setCreds] = useState<Cred[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [app, setApp] = useState({ name: "", bundleId: "", tagline: "" });
  const [screens, setScreens] = useState<Screen[]>([{ title: "Home", body: "" }]);
  const [apple, setApple] = useState({ issuerId: "", keyId: "", privateKey: "" });
  const [google, setGoogle] = useState({ serviceAccountJson: "", packageName: "" });
  const [expo, setExpo] = useState("");

  useEffect(() => {
    let on = true;
    api<{ credentials: Cred[]; facts: Facts }>("/api/mobile/credentials").then((d) => { if (on) { setCreds(d.credentials); setFacts(d.facts); } }).catch((e) => on && setErr(errMsg(e)));
    return () => { on = false; };
  }, []);

  async function save(kind: "apple" | "google" | "expo", payload: Record<string, string>, clear: () => void) {
    setErr(null);
    setBusy(kind);
    try {
      const d = await api<{ credentials: Cred[] }>("/api/mobile/credentials", { method: "POST", body: JSON.stringify({ kind, ...payload }) });
      setCreds(d.credentials);
      clear(); // the secret never stays in the page after it is saved
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  }
  async function remove(kind: Cred["kind"]) {
    setBusy(kind);
    try {
      const d = await api<{ credentials: Cred[] }>("/api/mobile/credentials", { method: "DELETE", body: JSON.stringify({ kind }) });
      setCreds(d.credentials);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  }
  async function download() {
    setErr(null);
    setBusy("zip");
    try {
      const res = await fetch("/api/mobile/project", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...app, screens: screens.filter((x) => x.title.trim()) }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${app.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "app"}-expo.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const st = (k: Cred["kind"]) => creds.find((c) => c.kind === k);
  const status = (k: Cred["kind"]) => {
    const c = st(k);
    return c ? (
      <div className={s.status} data-s={c.status} role="status">
        <strong>{c.status === "verified" ? "Verified" : c.status === "failed" ? "Not accepted" : "Saved"}</strong> · {c.hint}. {c.detail}{" "}
        <Button variant="secondary" size="sm" onClick={() => remove(k)} disabled={busy === k}>Remove</Button>
      </div>
    ) : null;
  };

  return (
    <div className={s.root} data-testid="mobile-studio">
      <CreateIntro title="Create a mobile app" lede="Describe your app, then download a project ready for the App Store and Google Play." />
      {err ? <p className={s.err} role="alert">{err}</p> : null}

      <details className={s.card} open>
        <summary><span className={s.n}>1</span> Describe the app</summary>
        <div className={s.body}>
          <label className={s.field}>App name<input className={s.input} value={app.name} maxLength={30} onChange={(e) => setApp({ ...app, name: e.target.value })} placeholder="Mill Lane Bakehouse" /></label>
          <label className={s.field}>Bundle ID (also the Android package)<input className={s.input} value={app.bundleId} onChange={(e) => setApp({ ...app, bundleId: e.target.value })} placeholder="com.yourname.appname" /></label>
          <label className={s.field}>One line about it (optional)<input className={s.input} value={app.tagline} maxLength={80} onChange={(e) => setApp({ ...app, tagline: e.target.value })} /></label>
          <div className={s.screens}>
            {screens.map((x, i) => (
              <div key={i} className={s.row}>
                <input className={s.input} style={{ width: 150 }} aria-label={`Screen ${i + 1} title`} value={x.title} maxLength={24} onChange={(e) => setScreens(screens.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} placeholder="Screen title" />
                <input className={`${s.input} ${s.grow}`} aria-label={`Screen ${i + 1} text`} value={x.body} maxLength={400} onChange={(e) => setScreens(screens.map((y, j) => (j === i ? { ...y, body: e.target.value } : y)))} placeholder="What this screen says" />
                {screens.length > 1 ? <Button variant="secondary" size="sm" onClick={() => setScreens(screens.filter((_, j) => j !== i))} aria-label={`Remove screen ${i + 1}`}>Remove</Button> : null}
              </div>
            ))}
            {screens.length < 6 ? <div><Button variant="secondary" size="sm" onClick={() => setScreens([...screens, { title: "", body: "" }])}>Add a screen</Button></div> : null}
          </div>
        </div>
      </details>

      <details className={s.card}>
        <summary><span className={s.n}>2</span> Store accounts <span className={s.opt}>optional until you publish</span></summary>
        <div className={s.body}>
          {facts ? (
            <>
              <div className={s.limit}><strong>Apple · {facts.apple.price}.</strong> {facts.apple.needs}<br />{facts.apple.api}<br />{facts.apple.review}</div>
              {status("apple")}
              <label className={s.field}>Issuer ID<input className={s.input} value={apple.issuerId} autoComplete="off" onChange={(e) => setApple({ ...apple, issuerId: e.target.value })} /></label>
              <label className={s.field}>Key ID<input className={s.input} value={apple.keyId} autoComplete="off" onChange={(e) => setApple({ ...apple, keyId: e.target.value })} /></label>
              <label className={s.field}>.p8 private key (write-only, stored encrypted)<textarea className={s.area} value={apple.privateKey} autoComplete="off" spellCheck={false} onChange={(e) => setApple({ ...apple, privateKey: e.target.value })} /></label>
              <div><Button variant="primary" size="sm" disabled={busy === "apple" || !apple.privateKey} onClick={() => save("apple", apple, () => setApple({ issuerId: "", keyId: "", privateKey: "" }))}>{busy === "apple" ? "Checking with Apple…" : "Save and check with Apple"}</Button></div>

              <div className={s.limit}><strong>Google · {facts.google.price}.</strong> {facts.google.needs}<br />{facts.google.api}<br />{facts.google.review}</div>
              {status("google")}
              <label className={s.field}>Service account JSON (write-only, stored encrypted)<textarea className={s.area} value={google.serviceAccountJson} autoComplete="off" spellCheck={false} onChange={(e) => setGoogle({ ...google, serviceAccountJson: e.target.value })} /></label>
              <label className={s.field}>Package name of the app already in Play Console (optional)<input className={s.input} value={google.packageName} onChange={(e) => setGoogle({ ...google, packageName: e.target.value })} placeholder="com.yourname.appname" /></label>
              <div><Button variant="primary" size="sm" disabled={busy === "google" || !google.serviceAccountJson} onClick={() => save("google", google, () => setGoogle({ serviceAccountJson: "", packageName: google.packageName }))}>{busy === "google" ? "Checking with Google…" : "Save and check with Google"}</Button></div>

              <div className={s.limit}><strong>Expo / EAS · {facts.expo.price}.</strong> {facts.expo.needs}</div>
              {status("expo")}
              <label className={s.field}>Expo access token (write-only)<input className={s.input} type="password" autoComplete="off" value={expo} onChange={(e) => setExpo(e.target.value)} /></label>
              <div><Button variant="primary" size="sm" disabled={busy === "expo" || !expo} onClick={() => save("expo", { token: expo }, () => setExpo(""))}>Save token</Button></div>
            </>
          ) : <p className={s.muted}><ActivityIndicator label="Loading" showLabel /></p>}
        </div>
      </details>

      <details className={s.card}>
        <summary><span className={s.n}>3</span> Get the project</summary>
        <div className={s.body}>
          <p className={s.muted}>You get a ZIP: an Expo / React Native app with your screens, an EAS config and a GitHub Actions workflow you run by hand. Keplar has not built it on EAS or submitted it for you; the README lists the steps. Both stores review every submission.</p>
          <div><Button variant="primary" size="sm" onClick={download} disabled={busy === "zip" || app.name.trim().length < 2 || !app.bundleId.trim()}>{busy === "zip" ? "Preparing…" : "Download the Expo project"}</Button></div>
        </div>
      </details>
    </div>
  );
}
