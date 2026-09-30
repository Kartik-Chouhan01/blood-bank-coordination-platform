import { useState } from 'react';
import {
  ANALYTICS_PERIODS,
  BLOOD_GROUPS,
  type AnalyticsBucket,
  type AnalyticsPeriod,
  type AnalyticsReport,
} from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { ChartCard } from '@/components/charts/ChartCard';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { LineChart, type LineSeries } from '@/components/charts/LineChart';
import { StatTile } from '@/components/charts/StatTile';
import { formatHours, formatNumber, formatPercent } from '@/components/charts/chartTheme';
import { BankScopeSelect } from '@/features/inventory/components/BankScopeSelect';
import { cn } from '@/utils/cn';
import { dashboardApi } from '../api';

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  7: 'Last 7 days',
  30: 'Last 30 days',
  90: 'Last 90 days',
  365: 'Last 12 months',
};

type Trend = 'requests' | 'units' | 'donations';
const TRENDS: { value: Trend; label: string }[] = [
  { value: 'requests', label: 'Requests' },
  { value: 'units', label: 'Units' },
  { value: 'donations', label: 'Donations' },
];

/** Bucket keys are calendar dates in the platform time zone; format them as such. */
function bucketLabels(keys: string[], bucket: AnalyticsBucket) {
  const fmt = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' });
  const short =
    bucket === 'month'
      ? fmt({ month: 'short', year: '2-digit' })
      : fmt({ day: 'numeric', month: 'short' });
  const long = fmt({ day: 'numeric', month: 'long', year: 'numeric' });
  const month = fmt({ month: 'long', year: 'numeric' });
  return keys.map((key) => {
    const d = new Date(`${key}T00:00:00Z`);
    return {
      short: short.format(d),
      long:
        bucket === 'week'
          ? `Week of ${long.format(d)}`
          : bucket === 'month'
            ? month.format(d)
            : long.format(d),
    };
  });
}

/** Keeps the last loaded value while a new one loads, so charts hold their frame on refetch. */
function useKept<T>(value: T | undefined) {
  const [kept, setKept] = useState(value);
  if (value !== undefined && value !== kept) setKept(value);
  return kept;
}

function trendSeries(report: AnalyticsReport, trend: Trend): LineSeries[] {
  const pick = (key: keyof AnalyticsReport['series'][number]) =>
    report.series.map((p) => Number(p[key]));
  switch (trend) {
    case 'requests':
      return [
        { label: 'Raised', values: pick('requestsRaised'), slot: 0 },
        { label: 'Fulfilled', values: pick('requestsFulfilled'), slot: 1 },
      ];
    case 'units':
      return [
        { label: 'Issued', values: pick('unitsIssued'), slot: 0 },
        { label: 'Expired', values: pick('unitsExpired'), slot: 1 },
      ];
    case 'donations':
      return [{ label: 'Donations', values: pick('donations'), slot: 0 }];
  }
}

export function AnalyticsPage() {
  const [days, setDays] = useState<AnalyticsPeriod>(30);
  const [bankId, setBankId] = useState('');
  const [trend, setTrend] = useState<Trend>('requests');
  const query = useApiQuery(
    () => dashboardApi.analytics({ days, ...(bankId && { bloodBankId: bankId }) }),
    [days, bankId],
  );
  const report = useKept(query.data);

  if (!report) {
    return (
      <>
        <PageHeader title="Analytics" />
        {query.error ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : (
          <LoadingState />
        )}
      </>
    );
  }

  const t = report.totals;
  const labels = bucketLabels(
    report.series.map((p) => p.bucket),
    report.range.bucket,
  );
  const series = trendSeries(report, trend);
  const scope = report.bloodBank ? report.bloodBank.name : 'all blood banks';
  const period = PERIOD_LABELS[report.range.days as AnalyticsPeriod].toLowerCase();

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`Requests are network-wide; units and donations cover ${scope}. Times in ${report.range.timeZone}.`}
      />
      {/* Filters: one row above everything they scope. */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Period"
          className="inline-flex gap-1 rounded-lg bg-slate-100 p-1"
        >
          {ANALYTICS_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={days === p}
              onClick={() => setDays(p)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                days === p
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <BankScopeSelect value={bankId} onChange={setBankId} />
        {query.error && (
          <span role="alert" className="text-sm text-red-700">
            Could not refresh: {query.error.message}
          </span>
        )}
      </div>

      <div
        className={cn('space-y-6 transition-opacity', query.isLoading && 'opacity-60')}
        aria-busy={query.isLoading}
      >
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="Requests raised"
            value={formatNumber(t.requestsRaised)}
            hint={`${t.emergencyRequests} emergency`}
          />
          <StatTile
            label="Fulfilment rate"
            value={formatPercent(t.fulfilmentRate)}
            hint="Of closed requests raised in the period (rejections excluded)"
          />
          <StatTile
            label="Median time to fulfil"
            value={formatHours(t.medianHoursToFulfil)}
            hint={`Emergencies: ${formatHours(t.emergencyMedianHoursToFulfil)}`}
          />
          <StatTile
            label="Units issued"
            value={formatNumber(t.unitsIssued)}
            hint={`${formatNumber(t.donations)} donations collected`}
          />
          <StatTile
            label="Lost to expiry"
            value={formatPercent(t.expiryWastageRate)}
            hint={`${t.unitsExpired} expired · ${t.unitsDiscarded} discarded for other reasons`}
          />
          <StatTile
            label="Donor outreach"
            value={formatNumber(t.donorsContacted)}
            hint={`${t.donorsInterested} replied they can help`}
          />
        </div>

        <ChartCard
          title="Trend"
          description={
            <span className="inline-flex flex-wrap items-center gap-2">
              Per {report.range.bucket}, {period}.
              <span role="group" aria-label="Metric" className="inline-flex gap-1">
                {TRENDS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={trend === option.value}
                    onClick={() => setTrend(option.value)}
                    className={cn(
                      'rounded-md px-2 py-0.5 text-xs font-medium',
                      trend === option.value
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </span>
            </span>
          }
          table={{
            columns: [
              report.range.bucket === 'day'
                ? 'Day'
                : report.range.bucket === 'week'
                  ? 'Week of'
                  : 'Month',
              ...series.map((s) => s.label),
            ],
            rows: labels.map((l, i) => [l.long, ...series.map((s) => s.values[i] ?? 0)]),
          }}
        >
          <LineChart
            labels={labels.map((l) => l.short)}
            longLabels={labels.map((l) => l.long)}
            series={series}
            summary={`${series.map((s) => s.label).join(' and ')} per ${report.range.bucket}, ${period}`}
          />
        </ChartCard>

        <ChartCard
          title="Demand and supply by blood group"
          description={`Units asked for vs issued, requests raised ${period}.`}
          table={{
            columns: ['Blood group', 'Requested', 'Issued'],
            rows: report.byBloodGroup.map((g) => [g.bloodGroup, g.unitsRequested, g.unitsIssued]),
          }}
        >
          <ColumnChart
            categories={[...BLOOD_GROUPS]}
            series={[
              {
                label: 'Requested',
                values: report.byBloodGroup.map((g) => g.unitsRequested),
                slot: 0,
              },
              { label: 'Issued', values: report.byBloodGroup.map((g) => g.unitsIssued), slot: 1 },
            ]}
            summary="Units requested and issued per blood group"
          />
        </ChartCard>
      </div>
    </>
  );
}
