import { useState } from 'react';
import { HandHeart, ThumbsDown, ThumbsUp } from 'lucide-react';
import {
  COMPONENT_LABELS,
  POTENTIAL_DONOR_LABEL,
  type DonorOutreachSelfView,
  type OutreachResponse,
} from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { MedicalDisclaimer } from '@/components/domain/MedicalDisclaimer';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { donorOutreachApi } from '@/features/matching/api';
import { toApiClientError } from '@/services/apiError';
import { formatDateTime } from '@/utils/format';

function HelpRequestCard({
  item,
  onAnswer,
  busy,
}: {
  item: DonorOutreachSelfView;
  onAnswer: (response: OutreachResponse) => void;
  busy: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-brand-50 px-2 py-0.5 text-lg font-bold text-brand-800">
              {item.bloodGroupNeeded}
            </span>
            <span className="text-sm text-slate-700">{COMPONENT_LABELS[item.componentType]}</span>
            <StatusBadge kind="urgency" value={item.urgency} />
          </div>
          <p className="text-sm text-slate-600">
            Needed by {formatDateTime(item.requiredBy)} in {item.city}
            {item.approxDistanceKm !== null && ` (about ${item.approxDistanceKm} km from you)`}.
          </p>
          <p className="text-xs text-slate-500">Contacted {formatDateTime(item.notifiedAt)}</p>
        </div>
        <StatusBadge kind="outreach" value={item.status} />
      </div>

      {item.canRespond ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <Button
            size="sm"
            icon={<ThumbsUp className="size-4" aria-hidden />}
            disabled={busy || item.status === 'INTERESTED'}
            onClick={() => onAnswer('INTERESTED')}
          >
            I can help
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<ThumbsDown className="size-4" aria-hidden />}
            disabled={busy || item.status === 'DECLINED'}
            onClick={() => onAnswer('DECLINED')}
          >
            Not this time
          </Button>
          {item.status === 'INTERESTED' && (
            <p className="text-sm text-slate-600">
              Thank you. Blood-bank staff can now see your contact details and will get in touch.
            </p>
          )}
        </div>
      ) : (
        !item.open && (
          <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-500">
            This request is closed — no action is needed.
          </p>
        )
      )}
    </Card>
  );
}

/**
 * Requests for help the donor was contacted about. Shows only what the donor needs to decide;
 * the hospital and patient are never identified.
 */
export function DonorHelpRequestsPage() {
  const { data, error, isLoading, refetch, setData } = useApiQuery(() => donorOutreachApi.mine());
  const [busyId, setBusyId] = useState<string>();
  const [failure, setFailure] = useState<string>();

  const answer = async (id: string, response: OutreachResponse) => {
    setBusyId(id);
    setFailure(undefined);
    try {
      setData(await donorOutreachApi.respond(id, { response }));
    } catch (err) {
      setFailure(toApiClientError(err).message);
      refetch();
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <>
      <PageHeader
        title="Requests for help"
        description="Blood banks may contact you when a nearby request needs your blood group."
      />
      <Alert tone="info">
        You were selected as a “{POTENTIAL_DONOR_LABEL.toLowerCase()}”. Answering “I can help” is
        not a commitment — blood-bank staff will contact you and decide whether you can donate.
      </Alert>
      {failure && <Alert tone="error">{failure}</Alert>}
      {isLoading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HandHeart className="size-6" aria-hidden />}
            title="No requests for help yet"
            description="Keep your availability up to date so blood banks know when they can ask."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {data.map((item) => (
            <HelpRequestCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onAnswer={(response) => void answer(item.id, response)}
            />
          ))}
        </div>
      )}
      <MedicalDisclaimer />
    </>
  );
}
