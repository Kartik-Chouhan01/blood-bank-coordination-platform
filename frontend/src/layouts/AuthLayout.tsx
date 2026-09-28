import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { Logo } from '@/components/domain/Logo';

/** Focused, distraction-free shell for sign-in, registration and account-recovery pages. */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="px-4 py-5 sm:px-6">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 pb-16 sm:px-6">
        <div className="w-full max-w-xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {description && <p className="mt-1.5 text-sm text-slate-600">{description}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}
