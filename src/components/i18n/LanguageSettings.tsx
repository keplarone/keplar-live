"use client";
/**
 * Settings → Language. Saves the site and app language (keplar-locale cookie, a year) without leaving Settings.
 * Answers always follow the language you write in; this choice is the fallback when a question's language is unclear.
 */
import Link from "next/link";
import { LanguagePicker } from "./LanguagePicker";
import s from "@/components/account/account.module.css";

export function LanguageSettings() {
  return (
    <div className={s.panel}>
      <div className={s.row}>
        <span className={s.k} id="language-setting">Language</span>
        <LanguagePicker variant="settings" />
      </div>
      <p className={s.note}>
        Used for Keplar&apos;s pages (for example <Link href="/es">/es</Link> or <Link href="/ja/pricing">/ja/pricing</Link>) and
        remembered on this device. Keplar answers in the language you write in; when a message&apos;s language is unclear, it uses
        this one. The app&apos;s own menus, the docs and the blog are still in English while their translations are in progress.
      </p>
    </div>
  );
}
