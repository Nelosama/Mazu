import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import { api } from '@/services/api';
import type { FeedbackDashboard, FeedbackItem, FollowUp, Interval95 } from '@/services/types';
import { useBusiness } from '@/hooks/useBusiness';
import { cn } from '@/lib/cn';
import { Alert, Badge, Card, EmptyState, PageHeader, PageLoader } from '@/components/ui';
import { Icon } from '@/components/Icon';

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;

export function FeedbackDashboardPage() {
  const { t, i18n } = useTranslation();
  const { businessId, business } = useBusiness();
  const [filter, setFilter] = useState<'all' | 'negative' | 'with_comment'>('all');
  const dash = useQuery({
    queryKey: ['feedback-dash', businessId],
    queryFn: () => api<FeedbackDashboard>(`/businesses/${businessId}/feedback/dashboard`),
  });
  const list = useQuery({
    queryKey: ['feedback-list', businessId, filter],
    queryFn: () => api<FeedbackItem[]>(`/businesses/${businessId}/feedback`, { query: { filter } }),
  });

  if (dash.isLoading) return <PageLoader label={t('common.loading')} />;
  const d = dash.data;
  if (!d) return <Alert>{t('errors.GENERIC')}</Alert>;
  const s = d.summary;
  const tz = business?.timezone ?? 'UTC';

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t('feedback.title')} subtitle={t('feedback.subtitle')} />

      {!s.reliable && s.responses > 0 && (
        <div className="mb-4">
          <Alert tone="amber">
            {t('feedback.smallSample', { n: s.responses, min: s.minReliableSample })}
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={t('feedback.avgRating')}
          value={s.rating.mean !== null ? `${s.rating.mean.toFixed(1)} ★` : '—'}
          detail={ci(s.rating, t)}
        />
        <Kpi
          label={t('feedback.responses')}
          value={String(s.responses)}
          detail={t('feedback.ofInvitations', { count: s.invitations })}
        />
        <Kpi
          label={t('feedback.wouldReturn')}
          value={pct(s.wouldReturn.yesRate)}
          detail={
            s.wouldReturn.yesInterval
              ? t('feedback.range', {
                  low: pct(s.wouldReturn.yesInterval.low),
                  high: pct(s.wouldReturn.yesInterval.high),
                })
              : undefined
          }
        />
        <Kpi
          label={t('feedback.responseRate')}
          value={pct(s.responseRate)}
          detail={
            d.pendingNegative !== undefined
              ? t('feedback.pendingNegative', { count: d.pendingNegative })
              : undefined
          }
        />
      </div>

      {s.responses === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Icon name="star" className="h-10 w-10" />}
            title={t('feedback.emptyTitle')}
            description={t('feedback.emptyText')}
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-gray-900">{t('feedback.distribution')}</h2>
            <ul className="space-y-2">
              {[...s.distribution].reverse().map((b) => (
                <li key={b.star} className="flex items-center gap-3 text-sm">
                  <span className="w-8 text-gray-600">{b.star} ★</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ width: `${s.responses ? (b.count / s.responses) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-8 text-right tabular-nums text-gray-700">{b.count}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-4 text-sm text-gray-600">
              <span>
                {t('survey.yes')}: <b>{s.wouldReturn.yes}</b>
              </span>
              <span>
                {t('survey.maybe')}: <b>{s.wouldReturn.maybe}</b>
              </span>
              <span>
                {t('survey.no')}: <b>{s.wouldReturn.no}</b>
              </span>
            </div>
          </Card>

          {d.detailed ? (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold text-gray-900">{t('feedback.monthly')}</h2>
              <div
                className="flex h-40 items-end gap-2"
                role="img"
                aria-label={t('feedback.monthly')}
              >
                {d.monthly!.map((m) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[11px] tabular-nums text-gray-600">
                      {m.avg?.toFixed(1)}
                    </span>
                    <div
                      className={cn('w-full rounded-t-md', m.reliable ? 'bg-brand' : 'bg-brand/40')}
                      style={{ height: `${((m.avg ?? 0) / 5) * 100}%` }}
                      title={`${m.responses}`}
                    />
                    <span className="text-[11px] capitalize text-gray-500">
                      {DateTime.fromISO(`${m.month}-01`).setLocale(i18n.language).toFormat('LLL')}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">{t('feedback.monthlyNote')}</p>
            </Card>
          ) : (
            <Card className="flex items-center p-5">
              <p className="text-sm text-gray-600">{t('feedback.upgrade')}</p>
            </Card>
          )}

          {d.detailed && (
            <>
              <Breakdown title={t('feedback.byStaff')} rows={d.byStaff!} />
              <Breakdown title={t('feedback.byService')} rows={d.byService!} />
            </>
          )}
        </div>
      )}

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-gray-900">{t('feedback.comments')}</h2>
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            {(['all', 'negative', 'with_comment'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-semibold',
                  filter === f ? 'bg-white shadow-sm' : 'text-gray-600',
                )}
              >
                {t(`feedback.filters.${f}`)}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-gray-500">{t('feedback.privateNote')}</p>
        {list.isLoading ? (
          <PageLoader label={t('common.loading')} />
        ) : (list.data ?? []).length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 ring-1 ring-gray-200">
            {t('feedback.noComments')}
          </p>
        ) : (
          <ul className="space-y-3">
            {list.data!.map((f) => (
              <CommentCard key={f.id} item={f} businessId={businessId} tz={tz} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ci(r: Interval95, t: (k: string, o?: Record<string, unknown>) => string) {
  if (r.low === null || r.high === null) return t('feedback.notEnough');
  return t('feedback.range', { low: r.low.toFixed(1), high: r.high.toFixed(1) });
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-gray-500">{detail}</p>}
    </Card>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; name: string; rating: Interval95; yesRate: number }[];
}) {
  const { t } = useTranslation();
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold text-gray-900">{title}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="pb-2 font-medium">{t('feedback.name')}</th>
            <th className="pb-2 text-right font-medium">{t('feedback.avg')}</th>
            <th className="pb-2 text-right font-medium">{t('feedback.wouldReturnShort')}</th>
            <th className="pb-2 text-right font-medium">n</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-2 font-medium text-gray-900">{r.name}</td>
              <td className="py-2 text-right tabular-nums">
                {r.rating.mean?.toFixed(1)}{' '}
                {!r.rating.reliable && (
                  <span className="text-amber-600" title={t('feedback.lowSampleTitle')}>
                    *
                  </span>
                )}
              </td>
              <td className="py-2 text-right tabular-nums">{pct(r.yesRate)}</td>
              <td className="py-2 text-right tabular-nums text-gray-500">{r.rating.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-gray-500">* {t('feedback.lowSampleTitle')}</p>
    </Card>
  );
}

function CommentCard({
  item,
  businessId,
  tz,
}: {
  item: FeedbackItem;
  businessId: string;
  tz: string;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (status: FollowUp) =>
      api(`/businesses/${businessId}/feedback/${item.id}`, {
        method: 'PATCH',
        body: { followUpStatus: status },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['feedback-list', businessId] });
      void qc.invalidateQueries({ queryKey: ['feedback-dash', businessId] });
    },
  });
  return (
    <li
      className={cn(
        'rounded-2xl bg-white p-4 ring-1',
        item.negative ? 'ring-red-200' : 'ring-gray-200',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-amber-500" aria-label={t('survey.stars', { count: item.rating })}>
          {'★'.repeat(item.rating)}
          <span className="text-gray-200">{'★'.repeat(5 - item.rating)}</span>
        </span>
        <Badge
          tone={item.wouldReturn === 'YES' ? 'green' : item.wouldReturn === 'NO' ? 'red' : 'amber'}
        >
          {t(`wouldReturn.${item.wouldReturn}`)}
        </Badge>
        {item.categories.map((c) => (
          <Badge key={c}>{t(`categories.${c}`)}</Badge>
        ))}
        <span className="ml-auto text-xs text-gray-500">
          {DateTime.fromISO(item.respondedAt, { zone: tz }).setLocale(i18n.language).toRelative()}
        </span>
      </div>
      {item.comment && <p className="mt-2 whitespace-pre-line text-gray-800">{item.comment}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-gray-500">
          {[item.customerName, item.staff.name, item.service?.name].filter(Boolean).join(' · ')}
        </span>
        <select
          aria-label={t('feedback.followUp')}
          value={item.followUpStatus}
          onChange={(e) => update.mutate(e.target.value as FollowUp)}
          disabled={update.isPending}
          className="h-8 rounded-lg border-0 py-0 pl-2 pr-7 text-sm ring-1 ring-gray-300"
        >
          {(['PENDING', 'IN_PROGRESS', 'RESOLVED'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`followUp.${s}`)}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}
