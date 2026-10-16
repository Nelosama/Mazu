import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import { api } from '@/services/api';
import type { AdminAppointment } from '@/services/types';
import { useBusiness, useServiceList, useStaffList } from '@/hooks/useBusiness';
import { cn } from '@/lib/cn';
import { formatTime } from '@/lib/format';
import { Button, EmptyState, PageLoader } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { QuickActionSheet } from '@/features/agenda/QuickActionSheet';
import { AppointmentSheet } from '@/features/agenda/AppointmentSheet';
import { StatusBadge } from '@/features/agenda/StatusBadge';

type View = 'day' | 'week' | 'staff';
const START_H = 7;
const END_H = 22;
const PX_PER_MIN = 1.2;

const typeStyles: Record<string, string> = {
  ONLINE: 'bg-brand-soft text-gray-900 border-l-4 border-brand',
  WALK_IN: 'bg-amber-50 text-gray-900 border-l-4 border-amber-500',
  BLOCKED:
    'bg-gray-100 text-gray-600 border-l-4 border-gray-400 bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(0,0,0,0.04)_6px,rgba(0,0,0,0.04)_12px)]',
};
const statusStyles: Record<string, string> = {
  COMPLETED: 'opacity-70',
  CANCELED: 'opacity-40 line-through',
  NO_SHOW: 'opacity-60 ring-1 ring-red-300',
};

export function AgendaPage() {
  const { t, i18n } = useTranslation();
  const { businessId, business, membership } = useBusiness();
  const tz = business?.timezone ?? 'UTC';
  const locale = i18n.language;
  const lockedStaffId = membership?.role === 'STAFF' ? membership.staffId : null;

  const [view, setView] = useState<View>('day');
  const [dateState, setDate] = useState<string | null>(null);
  const date = dateState ?? DateTime.now().setZone(tz).toISODate()!;
  const [staffFilter, setStaffFilter] = useState<string>('');
  const [showCanceled, setShowCanceled] = useState(false);
  const [quick, setQuick] = useState<{ staffId: string; startsAt: string } | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [selected, setSelected] = useState<AdminAppointment | null>(null);

  const staffQ = useStaffList(businessId);
  const servicesQ = useServiceList(businessId);
  const activeStaff = useMemo(() => (staffQ.data ?? []).filter((s) => s.active), [staffQ.data]);
  const focusStaff = staffFilter || lockedStaffId || activeStaff[0]?.id || '';

  const day = DateTime.fromISO(date, { zone: tz });
  const range = useMemo(() => {
    if (view === 'day') return { from: day.startOf('day'), to: day.endOf('day') };
    if (view === 'week') return { from: day.startOf('week'), to: day.endOf('week') };
    return { from: day.startOf('day'), to: day.plus({ days: 13 }).endOf('day') };
  }, [view, day]);

  const agendaQ = useQuery({
    queryKey: [
      'agenda',
      businessId,
      range.from.toISO(),
      range.to.toISO(),
      view === 'day' ? '' : focusStaff,
    ],
    queryFn: () =>
      api<AdminAppointment[]>(`/businesses/${businessId}/appointments`, {
        query: {
          from: range.from.toUTC().toISO(),
          to: range.to.toUTC().toISO(),
          staffId: view === 'day' ? undefined : focusStaff || undefined,
        },
      }),
    enabled: Boolean(businessId) && (view === 'day' || Boolean(focusStaff)),
    refetchInterval: 60_000,
  });
  const items = (agendaQ.data ?? []).filter((a) => showCanceled || a.status !== 'CANCELED');

  const shift = (dir: 1 | -1) =>
    setDate(
      day
        .plus(
          view === 'week' ? { weeks: dir } : view === 'staff' ? { days: 14 * dir } : { days: dir },
        )
        .toISODate()!,
    );
  const openQuick = (staffId: string, startsAt?: string) => {
    setQuick(startsAt ? { staffId, startsAt } : null);
    setQuickOpen(true);
  };

  if (staffQ.isLoading) return <PageLoader label={t('common.loading')} />;
  if (!activeStaff.length) {
    return <EmptyState title={t('agenda.noStaffTitle')} description={t('agenda.noStaffText')} />;
  }

  const title =
    view === 'week'
      ? `${range.from.setLocale(locale).toFormat('d LLL')} – ${range.to.setLocale(locale).toFormat('d LLL yyyy')}`
      : day.setLocale(locale).toFormat('cccc d LLLL');

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="mr-auto flex items-center gap-1">
          <button
            type="button"
            className="rounded-full p-2 hover:bg-gray-100"
            onClick={() => shift(-1)}
            aria-label={t('agenda.previous')}
          >
            <Icon name="chevronLeft" className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="rounded-full p-2 hover:bg-gray-100"
            onClick={() => shift(1)}
            aria-label={t('agenda.next')}
          >
            <Icon name="chevronRight" className="h-5 w-5" />
          </button>
          <h1 className="ml-1 text-lg font-bold capitalize text-gray-900 sm:text-xl">{title}</h1>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setDate(DateTime.now().setZone(tz).toISODate()!)}
        >
          {t('agenda.today')}
        </Button>
        <input
          type="date"
          aria-label={t('agenda.pickDate')}
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="h-9 rounded-xl border-0 px-2 text-sm ring-1 ring-gray-300"
        />
        <Button size="sm" onClick={() => openQuick(lockedStaffId ?? focusStaff)}>
          <Icon name="plus" className="h-4 w-4" />
          {t('agenda.new')}
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-xl bg-gray-100 p-1"
          role="tablist"
          aria-label={t('agenda.view')}
        >
          {(['day', 'week', 'staff'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-semibold',
                view === v ? 'bg-white shadow-sm' : 'text-gray-600',
              )}
            >
              {t(`agenda.views.${v}`)}
            </button>
          ))}
        </div>
        {view !== 'day' && !lockedStaffId && (
          <select
            aria-label={t('agenda.professional')}
            value={focusStaff}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="h-9 rounded-xl border-0 py-1 pl-3 pr-8 text-sm ring-1 ring-gray-300"
          >
            {activeStaff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showCanceled}
            onChange={(e) => setShowCanceled(e.target.checked)}
            className="h-4 w-4 accent-[var(--brand)]"
          />
          {t('agenda.showCanceled')}
        </label>
      </div>

      <Legend />

      {agendaQ.isLoading ? (
        <PageLoader label={t('common.loading')} />
      ) : view === 'staff' ? (
        <StaffList items={items} tz={tz} locale={locale} onSelect={setSelected} />
      ) : (
        <TimeGrid
          columns={
            view === 'day'
              ? activeStaff.map((s) => ({ key: s.id, label: s.name, staffId: s.id, date: day }))
              : Array.from({ length: 7 }, (_, i) => {
                  const d = range.from.plus({ days: i });
                  return {
                    key: d.toISODate()!,
                    label: d.setLocale(locale).toFormat('ccc d'),
                    staffId: focusStaff,
                    date: d,
                  };
                })
          }
          items={items}
          tz={tz}
          locale={locale}
          mode={view}
          canCreate={(staffId) => !lockedStaffId || staffId === lockedStaffId}
          onEmptyClick={(staffId, iso) => openQuick(staffId, iso)}
          onSelect={setSelected}
        />
      )}

      <QuickActionSheet
        key={quickOpen ? `${quick?.staffId}-${quick?.startsAt}` : 'closed'}
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        businessId={businessId}
        timezone={tz}
        staff={activeStaff}
        services={servicesQ.data ?? []}
        initial={quick}
        lockedStaffId={lockedStaffId}
      />
      <AppointmentSheet
        key={selected?.id ?? 'none'}
        appt={selected}
        onClose={() => setSelected(null)}
        businessId={businessId}
        businessName={business?.name ?? ''}
        timezone={tz}
        staff={staffQ.data ?? []}
      />
    </div>
  );
}

function Legend() {
  const { t } = useTranslation();
  return (
    <div className="mb-3 flex flex-wrap gap-3 text-xs text-gray-600" aria-hidden>
      {(['ONLINE', 'WALK_IN', 'BLOCKED'] as const).map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className={cn('h-3 w-3 rounded-sm', typeStyles[k])} />
          {t(`types.${k}`)}
        </span>
      ))}
    </div>
  );
}

interface Column {
  key: string;
  label: string;
  staffId: string;
  date: DateTime;
}

function TimeGrid({
  columns,
  items,
  tz,
  locale,
  mode,
  canCreate,
  onEmptyClick,
  onSelect,
}: {
  columns: Column[];
  items: AdminAppointment[];
  tz: string;
  locale: string;
  mode: View;
  canCreate: (staffId: string) => boolean;
  onEmptyClick: (staffId: string, iso: string) => void;
  onSelect: (a: AdminAppointment) => void;
}) {
  const { t } = useTranslation();
  const height = (END_H - START_H) * 60 * PX_PER_MIN;
  const scroller = useRef<HTMLDivElement>(null);
  const now = DateTime.now().setZone(tz);

  useEffect(() => {
    const minutes = Math.max(0, (now.hour - START_H - 1) * 60);
    scroller.current?.scrollTo({ top: minutes * PX_PER_MIN });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inColumn = (a: AdminAppointment, c: Column) => {
    const s = DateTime.fromISO(a.startsAt, { zone: tz });
    return a.staff.id === c.staffId && s.hasSame(c.date, 'day');
  };

  return (
    <div
      ref={scroller}
      className="max-h-[70vh] overflow-auto rounded-2xl bg-white ring-1 ring-gray-200"
    >
      <div className="flex min-w-max">
        <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-gray-100 bg-white">
          <div className="sticky top-0 h-10 border-b border-gray-100 bg-white" />
          <div className="relative" style={{ height }}>
            {Array.from({ length: END_H - START_H }, (_, i) => (
              <div
                key={i}
                className="absolute right-2 -translate-y-2 text-[11px] text-gray-400"
                style={{ top: i * 60 * PX_PER_MIN }}
              >
                {i > 0 &&
                  DateTime.fromObject({ hour: START_H + i })
                    .setLocale(locale)
                    .toLocaleString({ hour: 'numeric' })}
              </div>
            ))}
          </div>
        </div>
        {columns.map((c) => {
          const isToday = c.date.hasSame(now, 'day');
          return (
            <div
              key={c.key}
              className={cn(
                'shrink-0 border-r border-gray-100 last:border-r-0',
                mode === 'day' ? 'w-44 sm:w-52' : 'w-32 sm:w-36',
              )}
            >
              <div
                className={cn(
                  'sticky top-0 z-[5] flex h-10 items-center justify-center border-b border-gray-100 bg-white px-2 text-sm font-semibold capitalize',
                  isToday && mode === 'week' && 'text-brand-ink',
                )}
              >
                <span className="truncate">{c.label}</span>
              </div>
              <div
                className={cn('relative', canCreate(c.staffId) && 'cursor-pointer')}
                style={{
                  height,
                  backgroundImage: `repeating-linear-gradient(to bottom, #f3f4f6 0, #f3f4f6 1px, transparent 1px, transparent ${30 * PX_PER_MIN}px)`,
                }}
                onClick={(e) => {
                  if (!canCreate(c.staffId) || e.target !== e.currentTarget) return;
                  const y = e.nativeEvent.offsetY;
                  const minutes = Math.floor(y / PX_PER_MIN / 15) * 15;
                  const iso = c.date
                    .set({ hour: START_H, minute: 0, second: 0, millisecond: 0 })
                    .plus({ minutes })
                    .toISO()!;
                  onEmptyClick(c.staffId, iso);
                }}
                role="presentation"
              >
                {isToday && now.hour >= START_H && now.hour < END_H && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-[4] border-t-2 border-red-500"
                    style={{ top: ((now.hour - START_H) * 60 + now.minute) * PX_PER_MIN }}
                  />
                )}
                {items
                  .filter((a) => inColumn(a, c))
                  .map((a) => {
                    const s = DateTime.fromISO(a.startsAt, { zone: tz });
                    const e = DateTime.fromISO(a.endsAt, { zone: tz });
                    const top = Math.max(0, ((s.hour - START_H) * 60 + s.minute) * PX_PER_MIN);
                    const h = Math.max(22, e.diff(s, 'minutes').minutes * PX_PER_MIN - 2);
                    const label =
                      a.type === 'BLOCKED'
                        ? t(`blockReason.${a.blockReason ?? 'OTHER'}`)
                        : (a.customer?.name ?? a.walkInName ?? t('types.WALK_IN'));
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onSelect(a)}
                        className={cn(
                          'absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1 text-left text-xs shadow-sm transition hover:shadow',
                          typeStyles[a.type],
                          statusStyles[a.status],
                        )}
                        style={{ top, height: h }}
                        aria-label={`${label}, ${formatTime(a.startsAt, tz, locale)}, ${t(`status.${a.status}`)}`}
                      >
                        <p className="truncate font-semibold">{label}</p>
                        <p className="truncate text-[11px] opacity-80">
                          {formatTime(a.startsAt, tz, locale)}{' '}
                          {a.service ? `· ${a.service.name}` : ''}
                        </p>
                      </button>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StaffList({
  items,
  tz,
  locale,
  onSelect,
}: {
  items: AdminAppointment[];
  tz: string;
  locale: string;
  onSelect: (a: AdminAppointment) => void;
}) {
  const { t } = useTranslation();
  const byDay = useMemo(() => {
    const map = new Map<string, AdminAppointment[]>();
    for (const a of items) {
      const k = DateTime.fromISO(a.startsAt, { zone: tz }).toISODate()!;
      map.set(k, [...(map.get(k) ?? []), a]);
    }
    return [...map.entries()];
  }, [items, tz]);
  if (!byDay.length)
    return <EmptyState title={t('agenda.emptyTitle')} description={t('agenda.emptyText')} />;
  return (
    <div className="space-y-5">
      {byDay.map(([d, list]) => (
        <section key={d}>
          <h2 className="mb-2 text-sm font-semibold capitalize text-gray-500">
            {DateTime.fromISO(d, { zone: tz }).setLocale(locale).toFormat('cccc d LLLL')}
          </h2>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200">
            {list.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onSelect(a)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <span
                    className={cn(
                      'h-10 w-1 shrink-0 rounded-full',
                      a.type === 'ONLINE'
                        ? 'bg-brand'
                        : a.type === 'WALK_IN'
                          ? 'bg-amber-500'
                          : 'bg-gray-400',
                    )}
                  />
                  <div className="w-20 shrink-0 text-sm font-semibold text-gray-900">
                    {formatTime(a.startsAt, tz, locale)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900">
                      {a.type === 'BLOCKED'
                        ? t(`blockReason.${a.blockReason ?? 'OTHER'}`)
                        : (a.customer?.name ?? a.walkInName ?? t('types.WALK_IN'))}
                    </p>
                    <p className="truncate text-sm text-gray-500">
                      {a.service?.name ?? t(`types.${a.type}`)}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
