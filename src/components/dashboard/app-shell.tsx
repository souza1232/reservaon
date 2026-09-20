"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, CalendarCheck2 } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "./sign-out-button";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
}

function NavLinks({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  navItems,
  badgeLabel,
  title,
  userName,
  children,
}: {
  navItems: NavItem[];
  badgeLabel: string;
  title: string;
  userName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar px-4 py-6 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CalendarCheck2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-none">ReservaOn</p>
            <p className="text-xs text-muted-foreground">{badgeLabel}</p>
          </div>
        </div>
        <NavLinks items={navItems} pathname={pathname} />
        <div className="mt-auto space-y-2 border-t pt-4">
          <p className="truncate px-3 text-xs text-muted-foreground">{userName}</p>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-background px-4 lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 px-4 py-6">
              <SheetTitle className="mb-6 flex items-center gap-2 px-2 text-left">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <CalendarCheck2 className="h-5 w-5" />
                </span>
                <span>
                  <p className="text-sm font-semibold leading-none">ReservaOn</p>
                  <p className="text-xs font-normal text-muted-foreground">{badgeLabel}</p>
                </span>
              </SheetTitle>
              <NavLinks items={navItems} pathname={pathname} onNavigate={() => setOpen(false)} />
              <div className="mt-6 space-y-2 border-t pt-4">
                <p className="truncate px-3 text-xs text-muted-foreground">{userName}</p>
                <SignOutButton />
              </div>
            </SheetContent>
          </Sheet>
          <p className="font-semibold">{title}</p>
        </header>

        <main className="flex-1 bg-muted p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
