"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { BookmarkIcon, HomeIcon, ListIcon, SearchIcon, SparklesIcon, TicketIcon, UserIcon } from "./icons";

export function Nav() {
  const { user, ready, signOut } = useAuth();
  const pathname = usePathname();

  // Picks stays reachable on phones via Discover's "Picks by genre" button; the tab bar holds six at most.
  const links = [
    { href: "/", label: "Home", icon: HomeIcon, mobile: true },
    { href: "/search", label: "Discover", icon: SearchIcon, mobile: true },
    { href: "/picks", label: "Picks", icon: SparklesIcon, mobile: false },
    ...(user ? [{ href: "/watchlist", label: "Watchlist", icon: BookmarkIcon, mobile: true }] : []),
    { href: "/lists", label: "Rankings", icon: ListIcon, mobile: true },
    { href: "/live", label: "Live", icon: TicketIcon, mobile: true },
    ...(user ? [{ href: `/u/${user.username}`, label: "Profile", icon: UserIcon, mobile: true }] : []),
  ];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/60 bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="text-lg font-black tracking-tight">
            <span className="text-gradient">Encore</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isActive(l.href) ? "bg-panel-2 text-white" : "text-muted hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {ready && !user && (
              <>
                <Link href="/login" className="btn-ghost py-1.5">
                  Sign in
                </Link>
                <Link href="/register" className="btn-primary hidden py-1.5 sm:inline-flex">
                  Join
                </Link>
              </>
            )}
            {user && (
              <button onClick={signOut} className="text-sm text-muted hover:text-white">
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/60 bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-md justify-around">
          {links.filter((l) => l.mobile).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium ${
                isActive(href) ? "text-brand" : "text-muted"
              }`}
            >
              <Icon size={22} />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
