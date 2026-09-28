import {
  BookOpenIcon,
  LayoutPanelLeftIcon,
  ListTreeIcon,
  LogOutIcon,
  MoonIcon,
  PenLineIcon,
  ScaleIcon,
  SunIcon,
  UsersIcon,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/auth/useAuth'
import { IntegrityLight } from '@/components/IntegrityLight'
import { Wordmark } from '@/components/Wordmark'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { useTheme } from '@/hooks/useTheme'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** Only highlight on an exact match — `/transactions` must not light up on `/new`. */
  end?: boolean
  /** Extra path prefixes this item owns — `/` is Accounts, and so is `/accounts/7`. */
  owns?: string[]
  adminOnly?: boolean
}

const NAV: { group: string | null; items: NavItem[] }[] = [
  {
    group: null,
    items: [{ to: '/', label: 'Accounts', icon: ListTreeIcon, end: true, owns: ['/accounts'] }],
  },
  {
    group: 'Ledger',
    items: [
      { to: '/transactions', label: 'Journal', icon: BookOpenIcon, end: true },
      { to: '/transactions/new', label: 'New Entry', icon: PenLineIcon },
    ],
  },
  {
    group: 'Reports',
    items: [
      { to: '/overview', label: 'Overview', icon: LayoutPanelLeftIcon },
      { to: '/reports/trial-balance', label: 'Trial Balance', icon: ScaleIcon },
    ],
  },
  {
    group: 'Admin',
    items: [{ to: '/users', label: 'Users', icon: UsersIcon, adminOnly: true }],
  },
]

/**
 * Whether a nav item owns the current path.
 *
 * Hand-rolled rather than left to NavLink's own matching because the root route is the chart
 * of accounts: `/accounts/7` has to light up an item whose `to` is `/`, which no combination
 * of `end` can express.
 */
function owns(item: NavItem, pathname: string): boolean {
  if (item.owns?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true
  }

  return item.end ? pathname === item.to : pathname.startsWith(item.to)
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 rounded-md px-2.5 py-[0.4375rem] text-[0.875rem] transition-colors',
    '[&_svg]:size-4 [&_svg]:shrink-0',
    isActive
      ? 'bg-accent font-medium text-ink [&_svg]:text-ink'
      : 'text-muted hover:text-ink [&_svg]:text-faint hover:[&_svg]:text-muted',
  )

export function AppShell() {
  const location = useLocation()
  const { isAdmin } = useAuth()

  const nav = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => isAdmin || !item.adminOnly),
  })).filter((section) => section.items.length > 0)
  const items = nav.flatMap((section) => section.items)

  // Longest match wins, so `/transactions/new` reports "New Entry" and not "Journal".
  const current = items.filter((item) => owns(item, location.pathname)).sort(
    (a, b) => b.to.length - a.to.length,
  )[0]

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="hidden border-r border-rule lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="px-5 pt-6 pb-7">
          <Wordmark />
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3">
          {nav.map((section) => (
            <div key={section.group ?? 'root'} className="space-y-0.5">
              {section.group ? <p className="eyebrow px-2.5 pb-2">{section.group}</p> : null}
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={() => navLinkClass({ isActive: owns(item, location.pathname) })}
                >
                  <item.icon />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-3">
          <IntegrityLight />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <TopBar sectionLabel={current?.label} />

        {/* Horizontal nav for narrow viewports — the rail's content, laid on its side. */}
        <nav className="scrollbar-none flex gap-1 overflow-x-auto border-b border-rule px-3 py-2 lg:hidden">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={() => navLinkClass({ isActive: owns(item, location.pathname) })}
            >
              <item.icon />
              <span className="whitespace-nowrap">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <main className="mx-auto w-full max-w-[78rem] flex-1 px-5 py-8 sm:px-8 sm:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function TopBar({ sectionLabel }: { sectionLabel: string | undefined }) {
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-rule bg-paper/85 px-5 backdrop-blur-sm sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Wordmark className="lg:hidden [&_span.eyebrow]:hidden" />
        {sectionLabel ? <p className="eyebrow hidden lg:block">{sectionLabel}</p> : null}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </Button>

        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md py-1 pr-1.5 pl-1 transition-colors hover:bg-accent"
            >
              <span className="num grid size-7 place-items-center rounded-sm bg-primary text-[0.6875rem] font-semibold text-primary-ink">
                {user ? initials(user.fullName) : '—'}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-[0.8125rem] font-medium text-ink">
                  {user?.fullName}
                </span>
                <span className="eyebrow block text-[0.5625rem]">{user?.role}</span>
              </span>
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuLabel>
              <span className="block text-[0.8125rem] font-medium text-ink">{user?.email}</span>
              <span className="mt-1.5 block">
                <Badge tone={user?.role === 'Admin' ? 'debit' : 'neutral'}>{user?.role}</Badge>
              </span>
            </MenuLabel>
            <MenuSeparator />
            <MenuItem onSelect={signOut}>
              <LogOutIcon /> Sign out
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </header>
  )
}
