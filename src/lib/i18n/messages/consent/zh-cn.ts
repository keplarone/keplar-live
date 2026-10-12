// zh-cn cookie banner catalog. Keys mirror messages/consent/en.ts; anything missing falls back to English.
import type { ConsentCatalog } from "../../types";

const m: ConsentCatalog = {
  "title": "Cookie",
  "text": "Keplar 始终使用其运行所需的 Cookie：登录、安全、你的套餐和用量计数，以及你的主题。可选的页面浏览量和速度分析默认关闭，除非你允许。Keplar 还会在自己的服务器上统计访问量和当前在线人数，不使用 Cookie，也不保存你的 IP 地址。",
  "details": "详情",
  "categories": "Cookie 类别",
  "essential": "必要",
  "essentialDesc": "始终开启。登录会话、安全、套餐和用量计数器、主题以及此项选择。",
  "analytics": "分析",
  "analyticsDesc": "公开网站（Vercel）上的页面浏览、按钮点击和页面速度，以及访问从哪个页面开始、是否带来了注册或回答。绝不包括你的问题。没有广告，没有跨网站跟踪。",
  "save": "保存选择",
  "acceptAll": "全部接受",
  "reject": "拒绝非必要 Cookie",
  "customize": "自定义",
  "saved": "Cookie 选择已保存。",
  "accepted": "已接受所有 Cookie。",
  "rejected": "仅使用必要 Cookie。",
  "settings": "Cookie 设置"
};

export default m;
