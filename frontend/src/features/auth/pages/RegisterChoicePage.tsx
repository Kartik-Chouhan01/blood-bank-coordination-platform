import { Link } from 'react-router';
import { ArrowRight, HeartHandshake, Hospital } from 'lucide-react';
import type { ReactNode } from 'react';
import { AuthCard } from '@/layouts/AuthLayout';

function Choice({
  to,
  icon,
  title,
  body,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-4 rounded-xl border border-slate-200 p-5 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
    >
      <span className="rounded-lg bg-brand-50 p-2.5 text-brand-700">{icon}</span>
      <span className="flex-1">
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="mt-1 block text-sm text-slate-600">{body}</span>
      </span>
      <ArrowRight className="mt-1 size-5 text-slate-400 group-hover:text-brand-700" aria-hidden />
    </Link>
  );
}

export function RegisterChoicePage() {
  return (
    <AuthCard title="Create an account" description="Choose the account that fits you.">
      <div className="space-y-3">
        <Choice
          to="/register/donor"
          icon={<HeartHandshake className="size-6" aria-hidden />}
          title="I want to donate blood"
          body="Share your availability and be contacted when your blood group is needed nearby."
        />
        <Choice
          to="/register/hospital"
          icon={<Hospital className="size-6" aria-hidden />}
          title="I represent a hospital"
          body="Raise and track blood requests. Hospitals are verified before requests can be made."
        />
      </div>
      <p className="mt-6 text-sm text-slate-600">
        Blood-bank staff accounts are created by an administrator.{' '}
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Already have an account?
        </Link>
      </p>
    </AuthCard>
  );
}
