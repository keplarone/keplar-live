// ja cookie banner catalog. Keys mirror messages/consent/en.ts; anything missing falls back to English.
import type { ConsentCatalog } from "../../types";

const m: ConsentCatalog = {
  "title": "Cookie",
  "text": "Keplar は動作に必要な Cookie を常に使用します。ログイン、セキュリティ、プランと利用回数のカウント、テーマのためです。ページ閲覧数や表示速度の任意の分析は、許可しない限りオフのままです。また Keplar は自社サーバー上で訪問数と現在オンラインの人数を数えますが、Cookie は使わず、IP アドレスも保存しません。",
  "details": "詳細",
  "categories": "Cookie の種類",
  "essential": "必須",
  "essentialDesc": "常にオン。ログインセッション、セキュリティ、プランと利用回数のカウンター、テーマ、この選択。",
  "analytics": "分析",
  "analyticsDesc": "公開サイト（Vercel）でのページ閲覧数、ボタンのクリック、表示速度、および訪問が始まったページと、その訪問が登録や回答につながったかどうか。質問内容は一切含みません。広告なし、サイトをまたぐ追跡なし。",
  "save": "選択を保存",
  "acceptAll": "すべて許可",
  "reject": "必須以外を拒否",
  "customize": "カスタマイズ",
  "saved": "Cookie の設定を保存しました。",
  "accepted": "すべての Cookie を許可しました。",
  "rejected": "必須の Cookie のみ使用しています。",
  "settings": "Cookie 設定"
};

export default m;
