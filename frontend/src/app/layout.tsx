import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ServerWakeNotice } from "@/components/ui/ServerWakeNotice";
import { APP_NAME } from "@/lib/brand";
import { THEME_COLOR, THEME_INIT_SCRIPT } from "@/lib/theme";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description: "AI campaign workspace: from business idea to a ready campaign package.",
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR.dark,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Applies a saved light theme before the first paint (dark is the server default). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {children}
        <ServerWakeNotice />
      </body>
    </html>
  );
}
