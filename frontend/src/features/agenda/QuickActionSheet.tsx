import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import { api } from '@/services/api';
import type { BlockReason, Service, Staff } from '@/services/types';
import { cn } from '@/lib/cn';
import { Alert, Button, Input, Select, Sheet, useToast } from '@/components/ui';
import { useErrorMessage } from '@/hooks/useErrorMessage';

const REASONS: BlockReason[] = ['BREAK', 'ABSENCE', 'EXTRAORDINARY', 'OTHER'];
const DURATIONS = [15, 30, 45, 60, 90, 120];

interface Props {
  open: boolean;
  onClose: () => void;
  businessId: string;
  timezone: string;
  staff: Staff[];
  services: Service[];
  initial: { staffId: string; startsAt: string } | null;
  /** Si el usuario es STAFF, solo puede operar su propio perfil. */
  lockedStaffId?: string | null;
}

/** Bloqueo rápido: seleccionar horario → elegir motivo → confirmar. */
export function QuickActionSheet({
  open,
  onClose,
  businessId,
  timezone,
  staff,
  services,
  initial,
  lockedStaffId,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  // Se monta de nuevo en cada apertura (key en el padre): el estado inicial parte de la celda tocada.
  const [tab, setTab] = useState<'block' | 'walkin'>('block');
  const [staffId, setStaffId] = useState(
    () => initial?.staffId ?? lockedStaffId ?? staff[0]?.id ?? '',
  );
  const [start, setStart] = useState(() =>
    DateTime.fromISO(
      initial?.startsAt ?? DateTime.now().setZone(timezone).startOf('minute').toISO()!,
      { zone: timezone },
    ).toFormat("yyyy-MM-dd'T'HH:mm"),
  );
  const [reason, setReason] = useState<BlockReason>('BREAK');
  const [duration, setDuration] = useState(30);
  const [serviceId, setServiceId] = useState('');
  const [name, setName] = useState('');

  const startsAt = () => DateTime.fromISO(start, { zone: timezone }).toUTC().toISO()!;
  const done = (msg: string) => {
    void qc.invalidateQueries({ queryKey: ['agenda', businessId] });
    toast(msg);
    onClose();
  };

  const block = useMutation({
    mutationFn: () =>
      api(`/businesses/${businessId}/appointments/blocks`, {
        body: { staffId, startsAt: startsAt(), durationMinutes: duration, reason },
      }),
    onSuccess: () => done(t('agenda.blockCreated')),
  });
  const walkIn = useMutation({
    mutationFn: () =>
      api(`/businesses/${businessId}/appointments/walk-ins`, {
        body: {
          staffId,
          startsAt: startsAt(),
          serviceId: serviceId || undefined,
          durationMinutes: serviceId ? undefined : duration,
          name: name || undefined,
        },
      }),
    onSuccess: () => done(t('agenda.walkInCreated')),
  });
  const active = tab === 'block' ? block : walkIn;
  const staffServices = services.filter((s) => s.active && s.staffIds.includes(staffId));

  const chip = (selected: boolean) =>
    cn(
      'rounded-full px-3.5 py-2 text-sm font-medium ring-1 transition',
      selected
        ? 'bg-brand text-brand-fg ring-brand'
        : 'bg-white text-gray-700 ring-gray-300 hover:ring-gray-400',
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('agenda.quickTitle')}
      closeLabel={t('common.close')}
      footer={
        <Button
          block
          size="lg"
          loading={active.isPending}
          disabled={!staffId || !start}
          onClick={() => active.mutate()}
        >
          {tab === 'block' ? t('agenda.confirmBlock') : t('agenda.confirmWalkIn')}
        </Button>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
        {(['block', 'walkin'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              'rounded-lg py-2 text-sm font-semibold',
              tab === k ? 'bg-white shadow-sm' : 'text-gray-600',
            )}
          >
            {k === 'block' ? t('agenda.block') : t('agenda.walkIn')}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label={t('agenda.professional')}
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            disabled={Boolean(lockedStaffId)}
          >
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input
            label={t('agenda.start')}
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            step={300}
          />
        </div>

        {tab === 'block' ? (
          <>
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">{t('agenda.reason')}</p>
              <div className="flex flex-wrap gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={reason === r}
                    className={chip(reason === r)}
                    onClick={() => setReason(r)}
                  >
                    {t(`blockReason.${r}`)}
                  </button>
                ))}
              </div>
            </div>
            <DurationChips
              value={duration}
              onChange={setDuration}
              chip={chip}
              label={t('agenda.duration')}
            />
          </>
        ) : (
          <>
            <Select
              label={t('agenda.service')}
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              <option value="">{t('agenda.noService')}</option>
              {staffServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMinutes} min
                </option>
              ))}
            </Select>
            {!serviceId && (
              <DurationChips
                value={duration}
                onChange={setDuration}
                chip={chip}
                label={t('agenda.duration')}
              />
            )}
            <Input
              label={t('agenda.walkInName')}
              hint={t('common.optional')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </>
        )}
        {active.isError && <Alert>{errorMessage(active.error)}</Alert>}
      </div>
    </Sheet>
  );
}

function DurationChips({
  value,
  onChange,
  chip,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  chip: (s: boolean) => string;
  label: string;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-gray-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={value === d}
            className={chip(value === d)}
            onClick={() => onChange(d)}
          >
            {d >= 60 ? `${d / 60} h` : `${d} min`}
          </button>
        ))}
      </div>
    </div>
  );
}
