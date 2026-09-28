import { Link } from 'react-router';
import { APP_NAME, EMERGENCY_HOTLINE } from '@/constants/app';
import { MedicalDisclaimer } from '@/components/domain/MedicalDisclaimer';
import { WORKFLOW_STEPS } from '../content';
import { ContentPage } from './ContentPage';

export function AboutPage() {
  return (
    <ContentPage
      title={`About ${APP_NAME}`}
      lead="Blood supply is often fragmented across hospitals, blood banks and informal donor lists. We bring it into one coordinated, accountable system."
    >
      <section>
        <h2>The problem</h2>
        <p>
          When a hospital needs blood quickly, staff often phone around blood banks and search
          spreadsheets or messaging groups for donors. Stock that is about to expire in one place is
          missing in another, and nobody has the full picture.
        </p>
      </section>
      <section>
        <h2>What the platform does</h2>
        <p>
          It tracks each physical blood unit through its lifecycle, matches hospital requests
          against potentially compatible inventory, prevents double allocation, flags expiring
          stock, and reaches potential donors when inventory falls short — while keeping a full
          audit trail.
        </p>
      </section>
      <section>
        <h2>What it does not do</h2>
        <p>
          The platform is an administrative coordination tool. It never diagnoses, never decides
          medical eligibility, and never guarantees transfusion compatibility.
        </p>
        <MedicalDisclaimer className="mt-4" />
      </section>
    </ContentPage>
  );
}

export function HowItWorksPage() {
  return (
    <ContentPage
      title="How it works"
      lead="From donation to delivery, every step is visible and accountable."
    >
      <ol className="space-y-6">
        {WORKFLOW_STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white"
              aria-hidden
            >
              {index + 1}
            </span>
            <div>
              <h2>{step.title}</h2>
              <p className="mt-1">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <MedicalDisclaimer variant="compatibility" />
    </ContentPage>
  );
}

export function HelpPage() {
  return (
    <ContentPage title="Help & contact">
      <section>
        <h2>Donors</h2>
        <p>
          Create an account, add your blood group and general area, and set your availability. You
          decide whether you can be contacted and how often. Your contact details are shared only
          with blood-bank staff, and only after you respond to a request.
        </p>
      </section>
      <section>
        <h2>Hospitals</h2>
        <p>
          Register your hospital and an administrator will verify it before you can raise requests.
          Once verified, you can track every request through to receipt.
        </p>
      </section>
      <section>
        <h2>In an emergency</h2>
        <p>
          {EMERGENCY_HOTLINE ? (
            <>
              Call{' '}
              <a
                className="font-semibold text-brand-700 underline"
                href={`tel:${EMERGENCY_HOTLINE}`}
              >
                {EMERGENCY_HOTLINE}
              </a>
              , or{' '}
            </>
          ) : (
            'Contact your local blood bank directly, or '
          )}
          <Link to="/login" className="font-semibold text-brand-700 underline">
            sign in
          </Link>{' '}
          as a verified hospital to raise an EMERGENCY request.
        </p>
      </section>
    </ContentPage>
  );
}
