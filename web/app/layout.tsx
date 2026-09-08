import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Frontdesk｜AI 智能工单分流",
  description:
    "自动分类客服工单、判断优先级、生成待人工审核的回复草稿，并记录每次模型调用成本。",
  // Chrome offers to translate an English page for a visitor whose browser is
  // set to another language, and its translator rewrites text nodes into
  // <font> wrappers of its own. React then updates a tree whose nodes it no
  // longer recognises and the whole page dies on a removeChild that cannot
  // find its child — which lands on the visitor as a blank "Application
  // error", precisely while they are watching a live classification stream in.
  // Opting out keeps the page in English; it also keeps it running.
  other: { google: "notranslate" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" translate="no" className="notranslate">
      <body>
        <Providers>{children}</Providers>
        <footer className="icp-footer">
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">粤ICP备2026057508号-3</a>
        </footer>
      </body>
    </html>
  );
}
