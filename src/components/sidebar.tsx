"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Brain,
  StickyNote,
  Timer,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "DASHBOARD", icon: LayoutDashboard },
  { href: "/subjects", label: "SUBJECTS", icon: BookOpen },
  { href: "/flashcards", label: "FLASHCARDS", icon: Brain },
  { href: "/notes", label: "NOTES", icon: StickyNote },
  { href: "/sessions", label: "SESSIONS", icon: Timer },
  { href: "/settings", label: "SETTINGS", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useAppStore();

  return (
    <aside
      className={cn(
        "relative hidden h-screen flex-col border-r-2 border-border bg-bg transition-all duration-300 md:flex",
        sidebarOpen ? "w-60" : "w-16"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b-2 border-border px-4">
        {sidebarOpen && (
          <span className="text-2xl font-bold uppercase tracking-tighter text-accent">
            STUDYMAX
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="rounded-none p-1.5 text-muted-fg hover:bg-accent hover:text-accent-fg transition-colors"
        >
          {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0 p-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 border-l-2 px-3 py-3 text-xs font-bold uppercase tracking-wider transition-all duration-200",
                isActive
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-transparent text-muted-fg hover:border-fg hover:text-fg"
              )}
            >
              <Icon size={18} />
              {sidebarOpen && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {sidebarOpen && (
        <div className="border-t-2 border-border p-4 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
          V1.0
        </div>
      )}
    </aside>
  );
}
