import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import { api } from '@/services/api';
import type { AdminAppointment, Staff } from '@/services/types';
import { formatDate, formatMoney, formatTime } from '@/lib/format';
import { Alert, Button, Input, Select, Sheet, useToast } from '@/components/ui';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { StatusBadge } from './StatusBadge';

interface Props {
  appt: AdminAppointment | null;
  onClose: () => void;
  businessId: string;
  businessName: string;
  timezone: string;
  staff: Staff[];
}

export function AppointmentSheet({
  appt,
  onClose,
  businessId,
  businessName,
  timezone,
  staff,
}: Props) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  // Montado de nuevo por cita (key en el padre).
  const [mode, setMode] = useState<'view' | 'reschedule' | 'cancel'>('view');
  const [when, setWhen] = useState(() =>
    appt ? DateTime.fromISO(appt.startsAt, { zone: timezone }).toFormat("yyyy-MM-dd'T'HH:mm") : '',
  );
  const [staffId, setStaffId] = useState(() => appt?.staff.id ?? '');
  const [feedbackUrl, setFeedbackUrl] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());

  const action = useMutation({
    mutationFn: async (
      kind: 'complete' | 'no-show' | 'cancel' | 'reschedule' | 'feedback-link',
    ) => {
      const path = `/businesses/${businessId}/appointments/${appt!.id}/${kind}`;
      if (kind === 'reschedule') {
        return api<AdminAppointment>(path, {
          body: { startsAt: DateTime.fromISO(when, { zone: timezone }).toUTC().toISO(), staffId },
        });
      }
      return api<AdminAppointment & { feedbackUrl?: string }>(path, { method: 'POST', body: {} });
    },
    onSuccess: (data, kind) => {
      void qc.invalidateQueries({ queryKey: ['agenda', businessId] });
      if (data?.feedbackUrl) {
        setFeedbackUrl(data.feedbackUrl);
        setMode('view');
        toast(t('agenda.completed'));
        return;
      }
      toast(t(`agenda.done.${kind}`));
      onClose();
    },
  });

  if (!appt) return null;
  const locale = i18n.language;
  const started = new Date(appt.startsAt).getTime() <= openedAt;
  const isBlock = appt.type === 'BLOCKED';
  const title = isBlock
    ? t(`blockReason.${appt.blockReason ?? 'OTHER'}`)
    : (appt.customer?.name ?? appt.walkInName ?? t('types.WALK_IN'));
  const waText = feedbackUrl
    ? t('agenda.feedbackWhatsappText', { business: businessName, url: feedbackUrl })
    : '';
  const waLink = feedbackUrl
    ? `https://wa.me/${appt.customer?.phone.replace('+', '') ?? ''}?text=${encodeURIComponent(waText)}`
    : '';

  return (
    <Sheet open={Boolean(appt)} onClose={onClose} title={title} closeLabel={t('common.close')}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{t(`types.${appt.type}`)}</p>
          <StatusBadge status={appt.status} />
        </div>
        <dl className="space-y-2 text-sm">
          <Row
            label={t('agenda.when')}
            value={`${formatDate(appt.startsAt, timezone, locale)} · ${formatTime(appt.startsAt, timezone, locale)}–${formatTime(appt.endsAt, timezone, locale)}`}
          />
          <Row label={t('agenda.professional')} value={appt.staff.name} />
          {appt.service && <Row label={t('agenda.service')} value={appt.service.name} />}
          {appt.customer && (
            <Row
              label={t('agenda.phone')}
              value={
                <a
                  className="font-medium text-brand-ink"
                  href={`https://wa.me/${appt.customer.phone.replace('+', '')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {appt.customer.phone}
                </a>
              }
            />
          )}
          {appt.price && appt.currency && (
            <Row label={t('agenda.price')} value={formatMoney(appt.price, appt.currency, locale)} />
          )}
          {appt.notes && <Row label={t('agenda.notes')} value={appt.notes} />}
          {appt.feedback && (
            <Row
              label={t('agenda.survey')}
              value={
                appt.feedback.responded ? `★ ${appt.feedback.rating}` : t('agenda.surveyPending')
              }
            />
          )}
        </dl>

        {feedbackUrl && (
          <div className="space-y-2 rounded-2xl bg-brand-soft p-4">
            <p className="text-sm font-medium text-gray-900">{t('agenda.feedbackReady')}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(feedbackUrl)
                    .then(() => toast(t('common.copied')))
                }
              >
                {t('common.copyLink')}
              </Button>
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white"
              >
                {t('agenda.sendWhatsapp')}
              </a>
            </div>
            <p className="text-xs text-gray-600">{t('agenda.whatsappManualNote')}</p>
          </div>
        )}

        {action.isError && <Alert>{errorMessage(action.error)}</Alert>}

        {mode === 'reschedule' && (
          <div className="space-y-3 rounded-2xl bg-gray-50 p-4">
            <Input
              label={t('agenda.newTime')}
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              step={300}
            />
            <Select
              label={t('agenda.professional')}
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
            >
              {staff
                .filter((s) => s.active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
            <div className="flex gap-2">
              <Button variant="secondary" block onClick={() => setMode('view')}>
                {t('common.back')}
              </Button>
              <Button block loading={action.isPending} onClick={() => action.mutate('reschedule')}>
                {t('agenda.saveReschedule')}
              </Button>
            </div>
          </div>
        )}

        {mode === 'cancel' && (
          <div className="space-y-3 rounded-2xl bg-red-50 p-4">
            <p className="text-sm text-red-900">
              {isBlock ? t('agenda.removeBlockConfirm') : t('agenda.cancelConfirm')}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" block onClick={() => setMode('view')}>
                {t('common.back')}
              </Button>
              <Button
                variant="danger"
                block
                loading={action.isPending}
                onClick={() => action.mutate('cancel')}
              >
                {isBlock ? t('agenda.removeBlock') : t('agenda.cancelAppointment')}
              </Button>
            </div>
          </div>
        )}

        {mode === 'view' && appt.status === 'CONFIRMED' && (
          <div className="grid gap-2">
            {!isBlock && started && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  loading={action.isPending && action.variables === 'complete'}
                  onClick={() => action.mutate('complete')}
                >
                  {t('agenda.complete')}
                </Button>
                <Button
                  variant="secondary"
                  loading={action.isPending && action.variables === 'no-show'}
                  onClick={() => action.mutate('no-show')}
                >
                  {t('agenda.noShow')}
                </Button>
              </div>
            )}
            {!isBlock && (
              <Button variant="secondary" onClick={() => setMode('reschedule')}>
                {t('agenda.reschedule')}
              </Button>
            )}
            <Button variant="ghost" className="text-red-600" onClick={() => setMode('cancel')}>
              {isBlock ? t('agenda.removeBlock') : t('agenda.cancelAppointment')}
            </Button>
          </div>
        )}

        {mode === 'view' &&
          appt.status === 'COMPLETED' &&
          !feedbackUrl &&
          !appt.feedback?.responded && (
            <Button
              variant="secondary"
              block
              loading={action.isPending}
              onClick={() => action.mutate('feedback-link')}
            >
              {t('agenda.getFeedbackLink')}
            </Button>
          )}
      </div>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900 first-letter:uppercase">{value}</dd>
    </div>
  );
}
