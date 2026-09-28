import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { hasPermission, ROLE_LABELS, type Permission } from '@bbms/shared';
import {
  Bell,
  Building2,
  Hospital,
  ScrollText,
  Droplets,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Menu,
  UserCog,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { homePathFor } from '@/constants/navigation';
import { Logo } from '@/components/domain/Logo';
import { EmailVerificationBanner } from '@/features/auth/components/EmailVerificationBanner';
import { cn } from '@/utils/cn';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  end?: boolean;
}

function navItemsFor(homePath: string): NavItem[] {
  return [
    {
      to: homePath,
      label: 'Overview',
      icon: LayoutDashboard,
      permission: 'account:self',
      end: true,
    },
    { to: '/donor/profile', label: 'My profile', icon: UserRound, permission: 'donor:self' },
    { to: '/donor/donations', label: 'Donations', icon: Droplets, permission: 'donor:self' },
    { to: '/donor/settings', label: 'Settings', icon: Bell, permission: 'donor:self' },
    {
      to: '/hospital/profile',
      label: 'Hospital profile',
      icon: Hospital,
      permission: 'hospital:self',
    },
    { to: '/admin/donors', label: 'Donors', icon: HeartHandshake, permission: 'donors:read' },
    { to: '/admin/hospitals', label: 'Hospitals', icon: Hospital, permission: 'hospitals:read' },
    {
      to: '/admin/blood-banks',
      label: 'Blood banks',
      icon: Building2,
      permission: 'bloodBanks:read',
    },
    { to: '/admin/users', label: 'Users', icon: Users, permission: 'users:read' },
    { to: '/admin/audit-logs', label: 'Audit log', icon: ScrollText, permission: 'audit:read' },
    { to: '/account', label: 'Account', icon: UserCog, permission: 'account:self' },
  ];
}

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!user) return null;

  const homePath = homePathFor(user.role);
  const items = navItemsFor(homePath).filter((item) => hasPermission(user.role, item.permission));

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const nav = (
    <nav aria-label="Dashboard" className="space-y-1">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
              isActive
                ? 'bg-brand-50 text-brand-800'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )
          }
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
        <Logo to={homePath} />
        <div className="mt-8 flex-1">{nav}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              type="button"
              className="rounded-md p-2 text-slate-600"
              aria-expanded={menuOpen}
              aria-controls="dashboard-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? (
                <X className="size-5" aria-hidden />
              ) : (
                <Menu className="size-5" aria-hidden />
              )}
            </button>
            <Logo to={homePath} />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500">
                {ROLE_LABELS[user.role]}
                {user.profile?.kind === 'STAFF' && ` · ${user.profile.bloodBankName}`}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </div>
        </header>

        {menuOpen && (
          <div
            id="dashboard-menu"
            className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden"
          >
            {nav}
          </div>
        )}

        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl space-y-6">
            <EmailVerificationBanner />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
