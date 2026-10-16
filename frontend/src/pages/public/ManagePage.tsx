import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/services/api';
import type { DaySlots, PublicAppointment, Slot } from '@/services/types';
import { useBrandTheme } from '@/hooks/useBrandTheme';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatDate, formatMoney, formatTime } from '@/lib/format';
import { hasExplicitLanguage, setLanguage } from '@/i18n';
import { Alert, Badge, Button, Card, PageLoader, Sheet, Textarea } from '@/components/ui';
import { SlotPicker } from '@/features/booking/SlotPicker';
import { StatusBadge } from '@/features/agenda/StatusBadge';

export function ManagePage() {
  const { token = '' } = useParams();
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'view' | 'cancel' | 'reschedule'>('view');
  const [reason, setReason] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['manage', token],
    queryFn: () => api<PublicAppointment>(`/public/manage/${token}`, { auth: false }),
    retry: false,
  });
  const appt = q.data;
  useBrandTheme(appt?.business.primaryColor);
  useEffect(() => {
    if (appt && !hasExplicitLanguage()) setLanguage(appt.business.locale, false);
  }, [appt]);

  const cancel = useMutation({
    mutationFn: () =>
      api<PublicAppointment>(`/public/manage/${token}/cancel`, {
        auth: false,
        body: { reason: reason || undefined },
      }),
    onSuccess: (data) => {
      qc.setQueryData(['manage', token], data);
      setMode('view');
      setNotice(t('manage.canceledNotice'));
    },
  });
  const reschedule = useMutation({
    mutationFn: (s: Slot) =>
      api<PublicAppointment>(`/public/manage/${token}/reschedule`, {
        auth: false,
        body: { startsAt: s.startsAt },
      }),
    onSuccess: (data) => {
      qc.setQueryData(['manage', token], data);
      setMode('view');
      setSlot(null);
      setNotice(t('manage.rescheduledNotice'));
    },
  });

  if (q.isLoading) return <PageLoader label={t('common.loading')} />;
  if (q.error instanceof ApiError || !appt) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-gray-900">{t('manage.notFoundTitle')}</h1>
        <p className="mt-2 text-gray-500">{t('manage.notFoundText')}</p>
      </div>
    );
  }

  const locale = i18n.language;
  const tz = appt.timezone;

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 py-8">
      <p className="text-sm font-semibold text-brand-ink">{appt.business.name}</p>
      <h1 className="mt-1 text-2xl font-bold text-gray-900">{t('manage.title')}</h1>
      {notice && (
        <div className="mt-4">
          <Alert tone="green">{notice}</Alert>
        </div>
      )}

      <Card className="mt-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-gray-900">{appt.service?.name}</p>
            <p className="mt-1 text-gray-700 first-letter:uppercase">
              {formatDate(appt.startsAt, tz, locale)}
            </p>
            <p className="text-gray-700">
              {formatTime(appt.startsAt, tz, locale)} – {formatTime(appt.endsAt, tz, locale)}
            </p>
          </div>
          <StatusBadge status={appt.status} />
        </div>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">{t('booking.summary.with')}</dt>
            <dd className="font-medium">{appt.staff.name}</dd>
          </div>
          {appt.branch.address && (
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">{t('booking.summary.where')}</dt>
              <dd className="text-right font-medium">{appt.branch.address}</dd>
            </div>
          )}
          {appt.price && appt.currency && (
            <div className="flex justify-between">
              <dt className="text-gray-500">{t('booking.summary.price')}</dt>
              <dd className="font-medium">{formatMoney(appt.price, appt.currency, locale)}</dd>
            </div>
          )}
        </dl>
      </Card>

      {appt.status === 'CONFIRMED' && (
        <div className="mt-5 space-y-2">
          {appt.canReschedule && (
            <Button block size="lg" onClick={() => setMode('reschedule')}>
              {t('manage.reschedule')}
            </Button>
          )}
          {appt.canCancel && (
            <Button block variant="secondary" onClick={() => setMode('cancel')}>
              {t('manage.cancel')}
            </Button>
          )}
          {!appt.canCancel && (
            <Alert tone="amber">
              {t('manage.cannotModify', {
                hours: Math.round(appt.business.cancelWindowMinutes / 60),
              })}
            </Alert>
          )}
        </div>
      )}
      <a
        href={`/b/${appt.business.slug}`}
        className="mt-6 block text-center text-sm font-semibold text-brand-ink"
      >
        {t('manage.bookAnother')}
      </a>

      <Sheet
        open={mode === 'cancel'}
        onClose={() => setMode('view')}
        title={t('manage.cancelTitle')}
        closeLabel={t('common.close')}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => setMode('view')}>
              {t('manage.keep')}
            </Button>
            <Button
              variant="danger"
              block
              loading={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              {t('manage.confirmCancel')}
            </Button>
          </div>
        }
      >
        <p className="mb-4 text-sm text-gray-600">{t('manage.cancelText')}</p>
        <Textarea
          label={t('manage.reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
        />
        {cancel.isError && (
          <div className="mt-3">
            <Alert>{errorMessage(cancel.error)}</Alert>
          </div>
        )}
      </Sheet>

      <Sheet
        open={mode === 'reschedule'}
        onClose={() => setMode('view')}
        title={t('manage.rescheduleTitle')}
        closeLabel={t('common.close')}
        size="lg"
        footer={
          <Button
            block
            size="lg"
            disabled={!slot}
            loading={reschedule.isPending}
            onClick={() => slot && reschedule.mutate(slot)}
          >
            {slot
              ? t('manage.moveTo', {
                  when: `${formatDate(slot.startsAt, tz, locale)} ${formatTime(slot.startsAt, tz, locale)}`,
                })
              : t('manage.pickTime')}
          </Button>
        }
      >
        {reschedule.isError && (
          <div className="mb-3">
            <Alert>{errorMessage(reschedule.error)}</Alert>
          </div>
        )}
        <SlotPicker
          timezone={tz}
          maxAdvanceDays={60}
          queryKey={['manage-slots', token]}
          fetchDays={(from, to) =>
            api<DaySlots[]>(`/public/manage/${token}/availability`, {
              auth: false,
              query: { from, to },
            })
          }
          selected={slot}
          onSelect={setSlot}
        />
        <p className="mt-2">
          <Badge>{t('manage.sameStaff', { name: appt.staff.name })}</Badge>
        </p>
      </Sheet>
    </div>
  );
}
