/**
 * The locale registry: the one list every part of i18n reads (routing, picker, hreflang, sitemap, fonts, answer language).
 *
 * - `code` is the URL segment (lowercase BCP 47: /es/pricing, /pt-br/pricing). English is the default and lives at the root.
 * - `lang` is the value for <html lang> and Intl; `hreflang` is what search engines get (ISO 639-1 + region where it exists).
 * - `status`: "stable" locales are fully translated for every localized page: they are indexable and listed in hreflang and
 *   the sitemap. "beta" locales have the core strings (navigation, footer, hero, pricing headings, auth, the app composer) and
 *   fall back to English for the rest: they work, show a Beta badge in the picker and are indexable, but stay out of hreflang
 *   until their catalogs are complete (tests/i18n-catalogs.test.ts enforces that a stable locale has every key).
 * - `wave`: the rollout batch it shipped in (1 = launch set; 2 = EU official languages; 3 = Indian; 4 = African;
 *   5 = Central and Southeast Asian; 6 = Middle East; 7 = other languages with an established written standard).
 * - `script` picks the font fallback stack (src/components/i18n/i18n.css).
 */
import { CATALOGS } from "./loaders/available";
export type Dir = "ltr" | "rtl";
export type Script =
  | "latin" | "cyrillic" | "greek" | "arabic" | "hebrew" | "devanagari" | "bengali" | "gurmukhi" | "gujarati" | "oriya" | "tamil"
  | "telugu" | "kannada" | "malayalam" | "sinhala" | "thai" | "lao" | "khmer" | "myanmar" | "ethiopic" | "georgian" | "armenian"
  | "han-sc" | "han-tc" | "japanese" | "korean";
export type Region = "europe" | "middleEast" | "africa" | "southAsia" | "eastAsia" | "southeastAsia" | "centralAsia" | "americas";

export type LocaleInfo = {
  code: string;
  lang: string;
  hreflang: string;
  native: string;
  english: string;
  dir: Dir;
  script: Script;
  region: Region;
  status: "stable" | "beta";
  wave: number;
  /** Open Graph locale (language_TERRITORY). */
  og: string;
};

type Row = [code: string, native: string, english: string, script: Script, region: Region, og: string, extra?: { dir?: Dir; lang?: string; hreflang?: string }];

const W1: Row[] = [
  ["es", "Español", "Spanish", "latin", "europe", "es_ES"],
  ["fr", "Français", "French", "latin", "europe", "fr_FR"],
  ["de", "Deutsch", "German", "latin", "europe", "de_DE"],
  ["pt-br", "Português (Brasil)", "Portuguese (Brazil)", "latin", "americas", "pt_BR", { lang: "pt-BR", hreflang: "pt-BR" }],
  ["it", "Italiano", "Italian", "latin", "europe", "it_IT"],
  ["nl", "Nederlands", "Dutch", "latin", "europe", "nl_NL"],
  ["pl", "Polski", "Polish", "latin", "europe", "pl_PL"],
  ["tr", "Türkçe", "Turkish", "latin", "middleEast", "tr_TR"],
  ["ru", "Русский", "Russian", "cyrillic", "europe", "ru_RU"],
  ["uk", "Українська", "Ukrainian", "cyrillic", "europe", "uk_UA"],
  ["ar", "العربية", "Arabic", "arabic", "middleEast", "ar_AR", { dir: "rtl" }],
  ["he", "עברית", "Hebrew", "hebrew", "middleEast", "he_IL", { dir: "rtl" }],
  ["hi", "हिन्दी", "Hindi", "devanagari", "southAsia", "hi_IN"],
  ["bn", "বাংলা", "Bengali", "bengali", "southAsia", "bn_BD"],
  ["ur", "اردو", "Urdu", "arabic", "southAsia", "ur_PK", { dir: "rtl" }],
  ["id", "Bahasa Indonesia", "Indonesian", "latin", "southeastAsia", "id_ID"],
  ["vi", "Tiếng Việt", "Vietnamese", "latin", "southeastAsia", "vi_VN"],
  ["th", "ไทย", "Thai", "thai", "southeastAsia", "th_TH"],
  ["ja", "日本語", "Japanese", "japanese", "eastAsia", "ja_JP"],
  ["ko", "한국어", "Korean", "korean", "eastAsia", "ko_KR"],
  ["zh-cn", "简体中文", "Chinese (Simplified)", "han-sc", "eastAsia", "zh_CN", { lang: "zh-CN", hreflang: "zh-CN" }],
  ["zh-tw", "繁體中文", "Chinese (Traditional)", "han-tc", "eastAsia", "zh_TW", { lang: "zh-TW", hreflang: "zh-TW" }],
  // Filipino has no ISO 639-1 code; search engines take "tl" (Tagalog, the standard Filipino is based on) for hreflang.
  ["fil", "Filipino", "Filipino", "latin", "southeastAsia", "tl_PH", { hreflang: "tl" }],
  ["sw", "Kiswahili", "Swahili", "latin", "africa", "sw_KE"],
];

const W2: Row[] = [
  ["bg", "Български", "Bulgarian", "cyrillic", "europe", "bg_BG"],
  ["hr", "Hrvatski", "Croatian", "latin", "europe", "hr_HR"],
  ["cs", "Čeština", "Czech", "latin", "europe", "cs_CZ"],
  ["da", "Dansk", "Danish", "latin", "europe", "da_DK"],
  ["et", "Eesti", "Estonian", "latin", "europe", "et_EE"],
  ["fi", "Suomi", "Finnish", "latin", "europe", "fi_FI"],
  ["el", "Ελληνικά", "Greek", "greek", "europe", "el_GR"],
  ["hu", "Magyar", "Hungarian", "latin", "europe", "hu_HU"],
  ["ga", "Gaeilge", "Irish", "latin", "europe", "ga_IE"],
  ["lv", "Latviešu", "Latvian", "latin", "europe", "lv_LV"],
  ["lt", "Lietuvių", "Lithuanian", "latin", "europe", "lt_LT"],
  ["mt", "Malti", "Maltese", "latin", "europe", "mt_MT"],
  ["ro", "Română", "Romanian", "latin", "europe", "ro_RO"],
  ["sk", "Slovenčina", "Slovak", "latin", "europe", "sk_SK"],
  ["sl", "Slovenščina", "Slovenian", "latin", "europe", "sl_SI"],
  ["sv", "Svenska", "Swedish", "latin", "europe", "sv_SE"],
  ["pt-pt", "Português (Portugal)", "Portuguese (Portugal)", "latin", "europe", "pt_PT", { lang: "pt-PT", hreflang: "pt-PT" }],
];

const W3: Row[] = [
  ["ta", "தமிழ்", "Tamil", "tamil", "southAsia", "ta_IN"],
  ["te", "తెలుగు", "Telugu", "telugu", "southAsia", "te_IN"],
  ["mr", "मराठी", "Marathi", "devanagari", "southAsia", "mr_IN"],
  ["gu", "ગુજરાતી", "Gujarati", "gujarati", "southAsia", "gu_IN"],
  ["kn", "ಕನ್ನಡ", "Kannada", "kannada", "southAsia", "kn_IN"],
  ["ml", "മലയാളം", "Malayalam", "malayalam", "southAsia", "ml_IN"],
  ["pa", "ਪੰਜਾਬੀ", "Punjabi", "gurmukhi", "southAsia", "pa_IN"],
  ["or", "ଓଡ଼ିଆ", "Odia", "oriya", "southAsia", "or_IN"],
];

const W4: Row[] = [
  ["am", "አማርኛ", "Amharic", "ethiopic", "africa", "am_ET"],
  ["ha", "Hausa", "Hausa", "latin", "africa", "ha_NG"],
  ["yo", "Yorùbá", "Yoruba", "latin", "africa", "yo_NG"],
  ["ig", "Igbo", "Igbo", "latin", "africa", "ig_NG"],
  ["zu", "isiZulu", "Zulu", "latin", "africa", "zu_ZA"],
  ["xh", "isiXhosa", "Xhosa", "latin", "africa", "xh_ZA"],
  ["so", "Soomaali", "Somali", "latin", "africa", "so_SO"],
];

const W5: Row[] = [
  ["ms", "Bahasa Melayu", "Malay", "latin", "southeastAsia", "ms_MY"],
  ["km", "ខ្មែរ", "Khmer", "khmer", "southeastAsia", "km_KH"],
  ["lo", "ລາວ", "Lao", "lao", "southeastAsia", "lo_LA"],
  ["my", "မြန်မာ", "Burmese", "myanmar", "southeastAsia", "my_MM"],
  ["ne", "नेपाली", "Nepali", "devanagari", "southAsia", "ne_NP"],
  ["si", "සිංහල", "Sinhala", "sinhala", "southAsia", "si_LK"],
  ["mn", "Монгол", "Mongolian", "cyrillic", "centralAsia", "mn_MN"],
  ["kk", "Қазақ тілі", "Kazakh", "cyrillic", "centralAsia", "kk_KZ"],
  ["uz", "Oʻzbekcha", "Uzbek", "latin", "centralAsia", "uz_UZ"],
];

const W6: Row[] = [
  ["fa", "فارسی", "Persian", "arabic", "middleEast", "fa_IR", { dir: "rtl" }],
  ["ps", "پښتو", "Pashto", "arabic", "middleEast", "ps_AF", { dir: "rtl" }],
  ["ku", "Kurdî", "Kurdish (Kurmanji)", "latin", "middleEast", "ku_TR"],
];

const W7: Row[] = [
  ["ca", "Català", "Catalan", "latin", "europe", "ca_ES"],
  ["eu", "Euskara", "Basque", "latin", "europe", "eu_ES"],
  ["gl", "Galego", "Galician", "latin", "europe", "gl_ES"],
  ["cy", "Cymraeg", "Welsh", "latin", "europe", "cy_GB"],
  ["is", "Íslenska", "Icelandic", "latin", "europe", "is_IS"],
  ["sq", "Shqip", "Albanian", "latin", "europe", "sq_AL"],
  ["sr", "Српски", "Serbian", "cyrillic", "europe", "sr_RS"],
  ["mk", "Македонски", "Macedonian", "cyrillic", "europe", "mk_MK"],
  ["bs", "Bosanski", "Bosnian", "latin", "europe", "bs_BA"],
  ["be", "Беларуская", "Belarusian", "cyrillic", "europe", "be_BY"],
  ["ka", "ქართული", "Georgian", "georgian", "centralAsia", "ka_GE"],
  ["hy", "Հայերեն", "Armenian", "armenian", "centralAsia", "hy_AM"],
  ["az", "Azərbaycanca", "Azerbaijani", "latin", "centralAsia", "az_AZ"],
  ["af", "Afrikaans", "Afrikaans", "latin", "africa", "af_ZA"],
  ["lb", "Lëtzebuergesch", "Luxembourgish", "latin", "europe", "lb_LU"],
  ["ky", "Кыргызча", "Kyrgyz", "cyrillic", "centralAsia", "ky_KG"],
  ["tg", "Тоҷикӣ", "Tajik", "cyrillic", "centralAsia", "tg_TJ"],
  ["tk", "Türkmençe", "Turkmen", "latin", "centralAsia", "tk_TM"],
  ["tt", "Татарча", "Tatar", "cyrillic", "europe", "tt_RU"],
  ["ug", "ئۇيغۇرچە", "Uyghur", "arabic", "centralAsia", "ug_CN", { dir: "rtl" }],
  ["yi", "ייִדיש", "Yiddish", "hebrew", "europe", "yi_001", { dir: "rtl" }],
  ["eo", "Esperanto", "Esperanto", "latin", "europe", "eo_001"],
  ["jv", "Basa Jawa", "Javanese", "latin", "southeastAsia", "jv_ID"],
  ["su", "Basa Sunda", "Sundanese", "latin", "southeastAsia", "su_ID"],
  // Cebuano has no ISO 639-1 code: hreflang is left to the language tag search engines accept as-is.
  ["ceb", "Cebuano", "Cebuano", "latin", "southeastAsia", "ceb_PH"],
  ["mg", "Malagasy", "Malagasy", "latin", "africa", "mg_MG"],
  ["ht", "Kreyòl ayisyen", "Haitian Creole", "latin", "americas", "ht_HT"],
  ["nb", "Norsk bokmål", "Norwegian (Bokmål)", "latin", "europe", "nb_NO"],
  ["fy", "Frysk", "Western Frisian", "latin", "europe", "fy_NL"],
  ["gd", "Gàidhlig", "Scottish Gaelic", "latin", "europe", "gd_GB"],
  ["ckb", "کوردیی ناوەندی", "Kurdish (Sorani)", "arabic", "middleEast", "ckb_IQ", { dir: "rtl" }],
  ["sd", "سنڌي", "Sindhi", "arabic", "southAsia", "sd_PK", { dir: "rtl" }],
  ["as", "অসমীয়া", "Assamese", "bengali", "southAsia", "as_IN"],
];

const build = (rows: Row[], wave: number, status: "stable" | "beta"): LocaleInfo[] =>
  rows.map(([code, native, english, script, region, og, x]) => ({
    code, native, english, script, region, og, wave, status,
    dir: x?.dir ?? "ltr",
    lang: x?.lang ?? code,
    hreflang: x?.hreflang ?? x?.lang ?? code,
  }));

export const DEFAULT_LOCALE = "en";

export const ENGLISH: LocaleInfo = { code: "en", lang: "en", hreflang: "en", native: "English", english: "English", dir: "ltr", script: "latin", region: "americas", status: "stable", wave: 0, og: "en_US" };

/** Every locale except English. Order: wave, then as listed. */
/** Every planned locale, shipped or not (counts per wave come from here). */
export const REGISTRY: LocaleInfo[] = [
  ...build(W1, 1, "stable"),
  ...build(W2, 2, "beta"),
  ...build(W3, 3, "beta"),
  ...build(W4, 4, "beta"),
  ...build(W5, 5, "beta"),
  ...build(W6, 6, "beta"),
  ...build(W7, 7, "beta"),
];

const has = (ns: string, code: string) => (CATALOGS[ns] ?? []).includes(code);
/** A locale is live only once its strings exist: stable needs common + client + marketing, beta needs common. */
export const isAvailable = (l: LocaleInfo) => has("common", l.code) && (l.status === "beta" || (has("client", l.code) && has("marketing", l.code)));
/** Live non-English locales: routed, in the picker, detected, and (when stable) in hreflang and the sitemap. */
export const LOCALES: LocaleInfo[] = REGISTRY.filter(isAvailable);
export const ALL_LOCALES: LocaleInfo[] = [ENGLISH, ...LOCALES];
const BY_CODE = new Map(ALL_LOCALES.map((l) => [l.code, l]));

export type LocaleCode = string;
export const isLocale = (code: string | null | undefined): boolean => !!code && BY_CODE.has(code);
/** Registry entry for a code; unknown codes get English. */
export const localeInfo = (code: string | null | undefined): LocaleInfo => (code && BY_CODE.get(code)) || ENGLISH;
/** Locales that are indexable (in hreflang and the sitemap): English plus every stable one. */
export const INDEXABLE: LocaleInfo[] = ALL_LOCALES.filter((l) => l.status === "stable");
export const isRtl = (code: string) => localeInfo(code).dir === "rtl";
