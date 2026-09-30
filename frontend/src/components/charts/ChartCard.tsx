import { useId, useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { CHART_INK } from './chartTheme';

export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

interface ChartCardProps {
  title: string;
  description?: ReactNode;
  /** The same data as the chart, reachable without hovering. */
  table: ChartTable;
  children: ReactNode;
}

/** A chart with a chart/table switch, so every value is available without a pointer. */
export function ChartCard({ title, description, table, children }: ChartCardProps) {
  const [asTable, setAsTable] = useState(false);
  const captionId = useId();
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        actions={
          <button
            type="button"
            onClick={() => setAsTable((t) => !t)}
            aria-pressed={asTable}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            {asTable ? (
              <BarChart3 className="size-3.5" aria-hidden />
            ) : (
              <Table2 className="size-3.5" aria-hidden />
            )}
            {asTable ? 'Show chart' : 'Show table'}
          </button>
        }
      />
      <div className="px-5 py-4">
        {asTable ? (
          <div className="max-h-80 overflow-auto">
            <table className="min-w-full text-sm" aria-labelledby={captionId}>
              <caption id={captionId} className="sr-only">
                {title}
              </caption>
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  {table.columns.map((c, i) => (
                    <th
                      key={c}
                      scope="col"
                      className={i ? 'px-2 py-1.5 text-right' : 'py-1.5 pr-2'}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {table.rows.map((row) => (
                  <tr key={String(row[0])}>
                    {row.map((cell, i) =>
                      i === 0 ? (
                        <th key={i} scope="row" className="py-1.5 pr-2 text-left font-normal">
                          {cell}
                        </th>
                      ) : (
                        <td
                          key={i}
                          className="px-2 py-1.5 text-right"
                          style={{ color: CHART_INK.primary }}
                        >
                          {cell}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  );
}

/** Legend for two or more series: a key that mirrors the mark (line or square) plus the name. */
export function Legend({
  items,
  mark,
}: {
  items: { label: string; color: string }[];
  mark: 'line' | 'rect';
}) {
  if (items.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-4 text-xs text-slate-600">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={mark === 'line' ? 'h-0.5 w-4 rounded-full' : 'size-2.5 rounded-sm'}
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Tooltip body: values lead (strong), series names follow, keyed with a short line. */
export function TooltipRows({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; color: string }[];
}) {
  return (
    <>
      <p className="mb-1 text-xs text-slate-500">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-xs">
          <span
            aria-hidden
            className="h-0.5 w-3 rounded-full"
            style={{ backgroundColor: r.color }}
          />
          <strong className="font-semibold text-slate-900 tabular-nums">{r.value}</strong>
          <span className="text-slate-600">{r.label}</span>
        </p>
      ))}
    </>
  );
}
