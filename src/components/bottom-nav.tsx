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
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "HOME", icon: LayoutDashboard },
  { href: "/subjects", label: "SUBJECTS", icon: BookOpen },
  { href: "/flashcards", label: "CARDS", icon: Brain },
  { href: "/notes", label: "NOTES", icon: StickyNote },
  { href: "/sessions", label: "SESSIONS", icon: Timer },
  { href: "/settings", label: "MORE", icon: Settings },
];

// Mobile-only bottom navigation. Hidden on md+ (desktop uses Sidebar).
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex h-16 border-t-2 border-border bg-bg md:hidden">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive =
          pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 border-t-2 transition-colors",
              isActive
                ? "border-accent text-accent"
                : "border-transparent text-muted-fg"
            )}
          >
            <Icon size={20} />
            <span className="text-[9px] font-bold uppercase tracking-widest">
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
