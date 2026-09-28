import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { Menu, X } from 'lucide-react';
import { APP_NAME } from '@/constants/app';
import { homePathFor } from '@/constants/navigation';
import { Logo } from '@/components/domain/Logo';
import { useAuth } from '@/hooks/useAuth';
import { ButtonLink } from '@/components/ui/Button';
import { SystemStatus } from '@/features/system/components/SystemStatus';
import { cn } from '@/utils/cn';

const NAV_LINKS = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/about', label: 'About' },
  { to: '/help', label: 'Help' },
];

export function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuth();
  const accountLinks = user
    ? [{ to: homePathFor(user.role), label: 'My dashboard' }]
    : [
        { to: '/login', label: 'Sign in' },
        { to: '/register', label: 'Get started' },
      ];

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 text-sm font-medium',
                    isActive ? 'text-brand-700' : 'text-slate-600 hover:text-slate-900',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <ButtonLink to={homePathFor(user.role)}>My dashboard</ButtonLink>
            ) : (
              <>
                <ButtonLink to="/login" variant="ghost">
                  Sign in
                </ButtonLink>
                <ButtonLink to="/register">Get started</ButtonLink>
              </>
            )}
          </div>
          <button
            type="button"
            className="rounded-md p-2 text-slate-600 md:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X className="size-5" aria-hidden />
            ) : (
              <Menu className="size-5" aria-hidden />
            )}
          </button>
        </div>
        {menuOpen && (
          <nav
            id="mobile-menu"
            aria-label="Mobile"
            className="border-t border-slate-100 px-4 py-3 md:hidden"
          >
            {[...NAV_LINKS, ...accountLinks].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-slate-900 text-slate-300">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="font-semibold text-white">{APP_NAME}</p>
            <p className="mt-1 max-w-md text-xs text-slate-400">
              An administrative coordination platform. It does not provide medical advice or make
              medical decisions.
            </p>
          </div>
          <SystemStatus />
        </div>
      </footer>
    </div>
  );
}
