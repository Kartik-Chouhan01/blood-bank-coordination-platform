import { Link } from 'react-router';
import { Droplet } from 'lucide-react';
import { APP_NAME } from '@/constants/app';
import { cn } from '@/utils/cn';

export function Logo({ to = '/', inverted = false }: { to?: string; inverted?: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-2 font-semibold',
        inverted ? 'text-white' : 'text-slate-900',
      )}
    >
      <span className="rounded-lg bg-brand-600 p-1.5 text-white">
        <Droplet className="size-4" aria-hidden fill="currentColor" />
      </span>
      {APP_NAME}
    </Link>
  );
}
