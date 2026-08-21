import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { UndoToastHost } from "@/components/undo-toast";
import { ThemeEffects } from "@/components/theme-effects";

export const metadata: Metadata = {
  title: "StudyMax — Learn Smarter",
  description: "Full-stack study management with spaced repetition, notes, and progress tracking.",
};

export const viewport: Viewport = {
  themeColor: "#09090B",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* No-flash theme script: a plain inline <script> server-rendered into
            <head>. It runs before hydration so the persisted theme is applied
            with no flash. Because it is a raw <script> in a Server Component,
            Next emits it as static HTML — it is never reconciled by React on the
            client, so React 19 does not warn about a script tag during render
            (the fate of next/script's `beforeInteractive` strategy here). */}
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var p=localStorage.getItem('study-prefs');var t=p?JSON.parse(p).theme:'onyx';document.documentElement.setAttribute('data-theme',t||'onyx');}catch(e){document.documentElement.setAttribute('data-theme','onyx');}})();",
          }}
        />
      </head>
      <body className="bg-bg text-fg antialiased">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
            {children}
          </main>
        </div>
        <BottomNav />
        <UndoToastHost />
        <ThemeEffects />
      </body>
    </html>
  );
}
