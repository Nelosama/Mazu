import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import type { DaySlots, Slot } from '@/services/types';
import { cn } from '@/lib/cn';
import { Spinner } from '@/components/ui';

const WINDOW_DAYS = 14;

interface Props {
  timezone: string;
  maxAdvanceDays: number;
  queryKey: unknown[];
  fetchDays: (from: string, to: string) => Promise<DaySlots[]>;
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
}

/** Tira de fechas + rejilla de horas agrupadas por franja. Horas mostradas en la zona del negocio. */
export function SlotPicker({
  timezone,
  maxAdvanceDays,
  queryKey,
  fetchDays,
  selected,
  onSelect,
}: Props) {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => DateTime.now().setZone(timezone).startOf('day'), [timezone]);
  const [offset, setOffset] = useState(0);
  const from = today.plus({ days: offset });
  const to = from.plus({ days: WINDOW_DAYS - 1 });
  const [day, setDay] = useState<string | null>(null);

  const q = useQuery({
    queryKey: [...queryKey, from.toISODate()],
    queryFn: () => fetchDays(from.toISODate()!, to.toISODate()!),
    staleTime: 30_000,
  });

  const days = useMemo(() => q.data ?? [], [q.data]);
  const firstWithSlots = days.find((d) => d.slots.length > 0)?.date ?? null;
  const activeDay = day && days.some((d) => d.date === day) ? day : firstWithSlots;
  const slots = useMemo(
    () => days.find((d) => d.date === activeDay)?.slots ?? [],
    [days, activeDay],
  );

  const groups = useMemo(() => {
    const g: Record<'morning' | 'afternoon' | 'evening', Slot[]> = {
      morning: [],
      afternoon: [],
      evening: [],
    };
    for (const s of slots) {
      const h = DateTime.fromISO(s.startsAt, { zone: timezone }).hour;
      g[h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'].push(s);
    }
    return g;
  }, [slots, timezone]);

  const canPrev = offset > 0;
  const canNext = offset + WINDOW_DAYS < maxAdvanceDays;
  const navBtn = 'rounded-full p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30';

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold capitalize text-gray-900">
          {from.setLocale(i18n.language).toFormat('LLLL yyyy')}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            className={navBtn}
            disabled={!canPrev}
            onClick={() => {
              setOffset(offset - WINDOW_DAYS);
              setDay(null);
            }}
            aria-label={t('booking.prevDays')}
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.83 10l3.94 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" />
            </svg>
          </button>
          <button
            type="button"
            className={navBtn}
            disabled={!canNext}
            onClick={() => {
              setOffset(offset + WINDOW_DAYS);
              setDay(null);
            }}
            aria-label={t('booking.nextDays')}
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2"
        role="listbox"
        aria-label={t('booking.selectDate')}
      >
        {Array.from({ length: WINDOW_DAYS }, (_, i) => from.plus({ days: i })).map((d) => {
          const iso = d.toISODate()!;
          const has = (days.find((x) => x.date === iso)?.slots.length ?? 0) > 0;
          const active = iso === activeDay;
          return (
            <button
              key={iso}
              type="button"
              role="option"
              aria-selected={active}
              disabled={!has}
              onClick={() => setDay(iso)}
              className={cn(
                'flex w-14 shrink-0 snap-start flex-col items-center rounded-2xl py-2 text-sm transition',
                active
                  ? 'bg-brand text-brand-fg shadow'
                  : has
                    ? 'bg-white text-gray-900 ring-1 ring-gray-200 hover:ring-brand'
                    : 'bg-gray-50 text-gray-300',
              )}
            >
              <span className="text-[11px] font-medium uppercase">
                {d.setLocale(i18n.language).toFormat('ccc')}
              </span>
              <span className="text-lg font-semibold">{d.day}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 min-h-40" aria-live="polite">
        {q.isLoading ? (
          <div className="flex justify-center py-10 text-gray-400">
            <Spinner label={t('common.loading')} />
          </div>
        ) : q.isError ? (
          <p className="py-8 text-center text-sm text-red-600">{t('errors.GENERIC')}</p>
        ) : !activeDay ? (
          <div className="rounded-2xl bg-gray-50 px-4 py-8 text-center">
            <p className="font-medium text-gray-900">{t('booking.noSlotsTitle')}</p>
            <p className="mt-1 text-sm text-gray-500">{t('booking.noSlotsHint')}</p>
            {canNext && (
              <button
                type="button"
                className="mt-3 text-sm font-semibold text-brand-ink"
                onClick={() => {
                  setOffset(offset + WINDOW_DAYS);
                  setDay(null);
                }}
              >
                {t('booking.seeNextDays')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {(['morning', 'afternoon', 'evening'] as const).map((k) =>
              groups[k].length ? (
                <div key={k}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t(`booking.${k}`)}
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {groups[k].map((s) => {
                      const active = selected?.startsAt === s.startsAt;
                      return (
                        <button
                          key={s.startsAt}
                          type="button"
                          aria-pressed={active}
                          onClick={() => onSelect(s)}
                          className={cn(
                            'h-11 rounded-xl text-sm font-semibold transition',
                            active
                              ? 'bg-brand text-brand-fg shadow'
                              : 'bg-white text-gray-900 ring-1 ring-gray-200 hover:ring-brand',
                          )}
                        >
                          {DateTime.fromISO(s.startsAt, { zone: timezone })
                            .setLocale(i18n.language)
                            .toLocaleString(DateTime.TIME_SIMPLE)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-gray-500">{t('booking.timezoneNote', { tz: timezone })}</p>
    </div>
  );
}
