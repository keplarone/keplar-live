// zh-tw cookie banner catalog. Keys mirror messages/consent/en.ts; anything missing falls back to English.
import type { ConsentCatalog } from "../../types";

const m: ConsentCatalog = {
  "title": "Cookie",
  "text": "Keplar 一律使用運作所需的 Cookie：登入、安全性、你的方案與用量計數，以及你的主題。選用的頁面瀏覽與速度分析預設關閉，除非你允許。Keplar 也會在自己的伺服器上計算造訪次數與目前線上人數，不使用 Cookie，也不儲存你的 IP 位址。",
  "details": "詳細資訊",
  "categories": "Cookie 類別",
  "essential": "必要",
  "essentialDesc": "一律開啟。登入工作階段、安全性、方案與用量計數器、主題以及這項選擇。",
  "analytics": "分析",
  "analyticsDesc": "公開網站（Vercel）上的頁面瀏覽、按鈕點擊與頁面速度，以及造訪從哪個頁面開始、是否帶來註冊或回答。絕不包括你的問題。沒有廣告，沒有跨網站追蹤。",
  "save": "儲存選擇",
  "acceptAll": "全部接受",
  "reject": "拒絕非必要 Cookie",
  "customize": "自訂",
  "saved": "已儲存 Cookie 選擇。",
  "accepted": "已接受所有 Cookie。",
  "rejected": "僅使用必要 Cookie。",
  "settings": "Cookie 設定"
};

export default m;
