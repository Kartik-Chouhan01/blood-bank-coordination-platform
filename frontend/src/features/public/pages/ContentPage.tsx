import type { ReactNode } from 'react';

/** Shared shell for simple informational pages. */
export function ContentPage({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
      {lead && <p className="mt-3 text-lg text-slate-600">{lead}</p>}
      <div className="mt-8 space-y-6 text-slate-700 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_p]:leading-relaxed">
        {children}
      </div>
    </div>
  );
}
