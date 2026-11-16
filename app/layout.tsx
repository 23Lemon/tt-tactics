import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "乒乓球发接发技战术分析平台",
  description: "发球、接发、第三板与第四板的可视化套路分析。",
  icons: { icon: "/court.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
