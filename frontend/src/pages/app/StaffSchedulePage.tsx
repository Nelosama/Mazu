import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DateTime, Info } from 'luxon';
import { api } from '@/services/api';
import type { StaffSchedule, TimeRange } from '@/services/types';
import { useBusiness, useStaffList } from '@/hooks/useBusiness';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { hhmmToMinutes, minutesToHHMM } from '@/lib/format';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  PageHeader,
  PageLoader,
  Select,
  useToast,
} from '@/components/ui';

interface DayRow {
  enabled: boolean;
  start: string;
  end: string;
  breakEnabled: boolean;
  breakStart: string;
  breakEnd: string;
}

const defaultRow = (): DayRow => ({
  enabled: false,
  start: '09:00',
  end: '18:00',
  breakEnabled: false,
  breakStart: '13:00',
  breakEnd: '14:00',
});

function toRows(s: StaffSchedule): DayRow[] {
  return [1, 2, 3, 4, 5, 6, 7].map((d) => {
    const wh = s.workingHours
      .filter((w) => w.weekday === d)
      .sort((a, b) => a.startMinute - b.startMinute);
    const br = s.breaks.find((b) => b.weekday === d);
    if (!wh.length) return defaultRow();
    // Jornada partida guardada como dos tramos: se muestra como un tramo con descanso.
    const gap = wh.length > 1 ? { start: wh[0].endMinute, end: wh[1].startMinute } : null;
    return {
      enabled: true,
      start: minutesToHHMM(wh[0].startMinute),
      end: minutesToHHMM(wh[wh.length - 1].endMinute),
      breakEnabled: Boolean(br || gap),
      breakStart: minutesToHHMM(br?.startMinute ?? gap?.start ?? 780),
      breakEnd: minutesToHHMM(br?.endMinute ?? gap?.end ?? 840),
    };
  });
}

export function StaffSchedulePage() {
  const { staffId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const { businessId, business } = useBusiness();
  const staffQ = useStaffList(businessId);
  const staff = staffQ.data?.find((s) => s.id === staffId);
  const key = ['schedule', businessId, staffId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<StaffSchedule>(`/businesses/${businessId}/staff/${staffId}/schedule`),
  });
  if (q.isLoading || !q.data) return <PageLoader label={t('common.loading')} />;
  return (
    <ScheduleEditor
      key={staffId}
      businessId={businessId}
      staffId={staffId}
      staffName={staff?.name ?? ''}
      tz={business?.timezone ?? 'UTC'}
      data={q.data}
      lang={i18n.language}
    />
  );
}

function ScheduleEditor({
  businessId,
  staffId,
  staffName,
  tz,
  data,
  lang,
}: {
  businessId: string;
  staffId: string;
  staffName: string;
  tz: string;
  data: StaffSchedule;
  lang: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const key = ['schedule', businessId, staffId];
  const [rows, setRows] = useState<DayRow[]>(() => toRows(data));
  const [rowError, setRowError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const workingHours: TimeRange[] = [];
      const breaks: TimeRange[] = [];
      rows.forEach((r, i) => {
        if (!r.enabled) return;
        workingHours.push({
          weekday: i + 1,
          startMinute: hhmmToMinutes(r.start),
          endMinute: hhmmToMinutes(r.end),
        });
        if (r.breakEnabled)
          breaks.push({
            weekday: i + 1,
            startMinute: hhmmToMinutes(r.breakStart),
            endMinute: hhmmToMinutes(r.breakEnd),
          });
      });
      return api<StaffSchedule>(`/businesses/${businessId}/staff/${staffId}/schedule`, {
        method: 'PUT',
        body: { workingHours, breaks },
      });
    },
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      toast(t('common.saved'));
    },
  });

  const [exDate, setExDate] = useState(DateTime.now().toISODate()!);
  const [exClosed, setExClosed] = useState(true);
  const [exStart, setExStart] = useState('10:00');
  const [exEnd, setExEnd] = useState('14:00');
  const addException = useMutation({
    mutationFn: () =>
      api(`/businesses/${businessId}/staff/${staffId}/exceptions`, {
        body: {
          date: exDate,
          isClosed: exClosed,
          ...(exClosed
            ? {}
            : { startMinute: hhmmToMinutes(exStart), endMinute: hhmmToMinutes(exEnd) }),
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });
  const removeException = useMutation({
    mutationFn: (id: string) =>
      api(`/businesses/${businessId}/staff/${staffId}/exceptions/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const [toType, setToType] = useState('VACATION');
  const [toFrom, setToFrom] = useState(DateTime.now().toISODate()!);
  const [toTo, setToTo] = useState(DateTime.now().plus({ days: 6 }).toISODate()!);
  const addTimeOff = useMutation({
    mutationFn: () =>
      api<{ conflictingAppointments: number }>(
        `/businesses/${businessId}/staff/${staffId}/time-off`,
        { body: { type: toType, fromDate: toFrom, toDate: toTo } },
      ),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: key });
      toast(
        r.conflictingAppointments
          ? t('schedule.timeOffConflicts', { count: r.conflictingAppointments })
          : t('common.saved'),
        r.conflictingAppointments ? 'info' : 'success',
      );
    },
  });
  const removeTimeOff = useMutation({
    mutationFn: (id: string) =>
      api(`/businesses/${businessId}/staff/${staffId}/time-off/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const weekdays = Info.weekdays('long', { locale: lang });
  const update = (i: number, patch: Partial<DayRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const validate = () => {
    for (const r of rows) {
      if (!r.enabled) continue;
      if (r.end <= r.start) return t('schedule.errors.range');
      if (
        r.breakEnabled &&
        (r.breakEnd <= r.breakStart || r.breakStart < r.start || r.breakEnd > r.end)
      )
        return t('schedule.errors.break');
    }
    return null;
  };
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          to={`/app/${businessId}/staff`}
          className="text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          ← {t('staff.title')}
        </Link>
        <PageHeader
          title={t('schedule.title', { name: staffName })}
          subtitle={t('schedule.subtitle', { tz })}
        />
      </div>

      <Card className="divide-y divide-gray-100">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="w-32">
              <Checkbox
                label={<span className="font-medium capitalize">{weekdays[i]}</span>}
                checked={r.enabled}
                onChange={(e) => update(i, { enabled: e.target.checked })}
              />
            </div>
            {r.enabled ? (
              <div className="flex flex-1 flex-wrap items-center gap-2 text-sm">
                <input
                  type="time"
                  aria-label={t('schedule.start')}
                  value={r.start}
                  onChange={(e) => update(i, { start: e.target.value })}
                  className="rounded-lg border-0 py-1.5 ring-1 ring-gray-300"
                />
                <span>–</span>
                <input
                  type="time"
                  aria-label={t('schedule.end')}
                  value={r.end}
                  onChange={(e) => update(i, { end: e.target.value })}
                  className="rounded-lg border-0 py-1.5 ring-1 ring-gray-300"
                />
                <label className="ml-2 flex items-center gap-1.5 text-gray-600">
                  <input
                    type="checkbox"
                    checked={r.breakEnabled}
                    onChange={(e) => update(i, { breakEnabled: e.target.checked })}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  {t('schedule.break')}
                </label>
                {r.breakEnabled && (
                  <>
                    <input
                      type="time"
                      aria-label={t('schedule.breakStart')}
                      value={r.breakStart}
                      onChange={(e) => update(i, { breakStart: e.target.value })}
                      className="rounded-lg border-0 py-1.5 ring-1 ring-gray-300"
                    />
                    <span>–</span>
                    <input
                      type="time"
                      aria-label={t('schedule.breakEnd')}
                      value={r.breakEnd}
                      onChange={(e) => update(i, { breakEnd: e.target.value })}
                      className="rounded-lg border-0 py-1.5 ring-1 ring-gray-300"
                    />
                  </>
                )}
              </div>
            ) : (
              <span className="text-sm text-gray-400">{t('schedule.dayOff')}</span>
            )}
          </div>
        ))}
        <div className="flex items-center justify-end gap-3 px-4 py-3">
          {(rowError || save.isError) && (
            <span className="text-sm text-red-600">{rowError ?? errorMessage(save.error)}</span>
          )}
          <Button
            loading={save.isPending}
            onClick={() => {
              const err = validate();
              setRowError(err);
              if (!err) save.mutate();
            }}
          >
            {t('schedule.save')}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold text-gray-900">{t('schedule.exceptions')}</h2>
        <p className="mb-3 text-sm text-gray-500">{t('schedule.exceptionsHint')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label={t('schedule.date')}
            type="date"
            value={exDate}
            onChange={(e) => setExDate(e.target.value)}
          />
          <Select
            label={t('schedule.kind')}
            value={exClosed ? 'closed' : 'custom'}
            onChange={(e) => setExClosed(e.target.value === 'closed')}
          >
            <option value="closed">{t('schedule.closedDay')}</option>
            <option value="custom">{t('schedule.customHours')}</option>
          </Select>
          {!exClosed && (
            <>
              <Input
                label={t('schedule.start')}
                type="time"
                value={exStart}
                onChange={(e) => setExStart(e.target.value)}
              />
              <Input
                label={t('schedule.end')}
                type="time"
                value={exEnd}
                onChange={(e) => setExEnd(e.target.value)}
              />
            </>
          )}
          <Button
            variant="secondary"
            loading={addException.isPending}
            onClick={() => addException.mutate()}
          >
            {t('common.add')}
          </Button>
        </div>
        {addException.isError && (
          <div className="mt-3">
            <Alert>{errorMessage(addException.error)}</Alert>
          </div>
        )}
        <ul className="mt-3 divide-y divide-gray-100 text-sm">
          {data.exceptions.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2">
              <span>
                {DateTime.fromISO(e.date)
                  .setLocale(lang)
                  .toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)}{' '}
                ·{' '}
                {e.isClosed
                  ? t('schedule.closedDay')
                  : `${minutesToHHMM(e.startMinute!)}–${minutesToHHMM(e.endMinute!)}`}
              </span>
              <button
                type="button"
                className="text-red-600"
                onClick={() => removeException.mutate(e.id)}
              >
                {t('common.delete')}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold text-gray-900">{t('schedule.timeOff')}</h2>
        <p className="mb-3 text-sm text-gray-500">{t('schedule.timeOffHint')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label={t('schedule.kind')}
            value={toType}
            onChange={(e) => setToType(e.target.value)}
          >
            {['VACATION', 'DAY_OFF', 'OTHER'].map((k) => (
              <option key={k} value={k}>
                {t(`timeOff.${k}`)}
              </option>
            ))}
          </Select>
          <Input
            label={t('schedule.from')}
            type="date"
            value={toFrom}
            onChange={(e) => setToFrom(e.target.value)}
          />
          <Input
            label={t('schedule.to')}
            type="date"
            value={toTo}
            onChange={(e) => setToTo(e.target.value)}
          />
          <Button
            variant="secondary"
            loading={addTimeOff.isPending}
            onClick={() => addTimeOff.mutate()}
          >
            {t('common.add')}
          </Button>
        </div>
        {addTimeOff.isError && (
          <div className="mt-3">
            <Alert>{errorMessage(addTimeOff.error)}</Alert>
          </div>
        )}
        <ul className="mt-3 divide-y divide-gray-100 text-sm">
          {data.timeOff.map((o) => (
            <li key={o.id} className="flex items-center justify-between py-2">
              <span>
                {t(`timeOff.${o.type}`)} ·{' '}
                {DateTime.fromISO(o.startsAt, { zone: tz })
                  .setLocale(lang)
                  .toLocaleString(DateTime.DATE_MED)}{' '}
                →{' '}
                {DateTime.fromISO(o.endsAt, { zone: tz })
                  .minus({ minutes: 1 })
                  .setLocale(lang)
                  .toLocaleString(DateTime.DATE_MED)}
              </span>
              <button
                type="button"
                className="text-red-600"
                onClick={() => removeTimeOff.mutate(o.id)}
              >
                {t('common.delete')}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
