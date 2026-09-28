import {
  ArrowRight,
  Building2,
  EyeOff,
  HeartHandshake,
  Hospital,
  Phone,
  ScrollText,
  ShieldCheck,
  Siren,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { APP_TAGLINE, EMERGENCY_HOTLINE } from '@/constants/app';
import { ButtonLink } from '@/components/ui/Button';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { Card } from '@/components/ui/Card';
import { MedicalDisclaimer } from '@/components/domain/MedicalDisclaimer';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { WORKFLOW_STEPS } from '../content';

function RoleCard({
  icon,
  title,
  body,
  cta,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  cta: ReactNode;
}) {
  return (
    <Card className="flex flex-col p-6">
      <div className="mb-4 w-fit rounded-lg bg-brand-50 p-2.5 text-brand-700">{icon}</div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 flex-1 text-sm text-slate-600">{body}</p>
      <div className="mt-5">{cta}</div>
    </Card>
  );
}

const TRUST_POINTS = [
  {
    icon: <EyeOff className="size-5" aria-hidden />,
    title: 'Donor privacy by default',
    body: 'Phone numbers, emails and addresses are never shown publicly. Matching uses approximate area only.',
  },
  {
    icon: <ShieldCheck className="size-5" aria-hidden />,
    title: 'Verified participants',
    body: 'Hospitals are verified by administrators before they can raise requests.',
  },
  {
    icon: <ScrollText className="size-5" aria-hidden />,
    title: 'Full audit trail',
    body: 'Every reservation, issue, override and status change records who did it, when and why.',
  },
];

export function LandingPage() {
  return (
    <>
      <section className="bg-gradient-to-b from-white to-slate-50">
        <div className="mx-auto max-w-6xl px-4 pt-16 pb-12 sm:px-6 lg:pt-24">
          <div className="max-w-3xl">
            <div className="mb-5 flex flex-wrap gap-2">
              <StatusBadge kind="urgency" value="EMERGENCY" />
              <StatusBadge kind="urgency" value="URGENT" />
              <StatusBadge kind="urgency" value="ROUTINE" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-balance text-slate-900 sm:text-5xl">
              {APP_TAGLINE}
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-slate-600">
              One platform to track every blood unit from donation to delivery, match hospital
              requests against live inventory, and reach potential donors when stock runs short.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink
                to="/register/donor"
                size="lg"
                icon={<HeartHandshake className="size-5" aria-hidden />}
              >
                Become a donor
              </ButtonLink>
              <ButtonLink
                to="/register/hospital"
                size="lg"
                variant="secondary"
                icon={<Hospital className="size-5" aria-hidden />}
              >
                Register your hospital
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="emergency-heading" className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-4 rounded-xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <Siren className="mt-0.5 size-6 shrink-0 text-red-700" aria-hidden />
            <div>
              <h2 id="emergency-heading" className="font-semibold text-red-900">
                Hospital facing an emergency?
              </h2>
              <p className="mt-1 text-sm text-red-900/80">
                Verified hospitals can raise an EMERGENCY request, which is prioritised for
                blood-bank staff immediately.
                {EMERGENCY_HOTLINE && (
                  <>
                    {' '}
                    For immediate help call{' '}
                    <a className="font-semibold underline" href={`tel:${EMERGENCY_HOTLINE}`}>
                      {EMERGENCY_HOTLINE}
                    </a>
                    .
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {EMERGENCY_HOTLINE && (
              <a href={`tel:${EMERGENCY_HOTLINE}`} className={buttonClasses('secondary')}>
                <Phone className="size-4" aria-hidden />
                Call
              </a>
            )}
            <ButtonLink
              to="/login"
              variant="danger"
              icon={<ArrowRight className="size-4" aria-hidden />}
            >
              Sign in to request
            </ButtonLink>
          </div>
        </div>
      </section>

      <section aria-labelledby="roles-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="roles-heading" className="text-2xl font-bold text-slate-900">
          Built for everyone in the chain
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <RoleCard
            icon={<HeartHandshake className="size-6" aria-hidden />}
            title="Donors"
            body="Keep your availability up to date, see relevant needs in your area, and choose how and when you are contacted."
            cta={
              <ButtonLink to="/register/donor" variant="secondary" size="sm">
                Join as a donor
              </ButtonLink>
            }
          />
          <RoleCard
            icon={<Hospital className="size-6" aria-hidden />}
            title="Hospitals"
            body="Raise requests with declared urgency, follow allocation in real time, and confirm receipt — with a complete history."
            cta={
              <ButtonLink to="/register/hospital" variant="secondary" size="sm">
                Register a hospital
              </ButtonLink>
            }
          />
          <RoleCard
            icon={<Building2 className="size-6" aria-hidden />}
            title="Blood banks"
            body="Manage the unit lifecycle, testing and expiry, allocate stock earliest-expiry-first, and coordinate donor outreach."
            cta={
              <ButtonLink to="/how-it-works" variant="secondary" size="sm">
                See the workflow
              </ButtonLink>
            }
          />
        </div>
      </section>

      <section aria-labelledby="how-heading" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="how-heading" className="text-2xl font-bold text-slate-900">
            How it works
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            {WORKFLOW_STEPS.map((step, index) => (
              <li key={step.title}>
                <span
                  className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <h3 className="mt-3 font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="trust-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="trust-heading" className="text-2xl font-bold text-slate-900">
          Trust, privacy and safety
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {TRUST_POINTS.map((point) => (
            <div key={point.title} className="flex gap-3">
              <div className="h-fit rounded-lg bg-slate-100 p-2 text-slate-700">{point.icon}</div>
              <div>
                <h3 className="font-semibold text-slate-900">{point.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{point.body}</p>
              </div>
            </div>
          ))}
        </div>
        <MedicalDisclaimer className="mt-10" />
      </section>
    </>
  );
}
