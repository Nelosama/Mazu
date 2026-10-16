import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/services/api';
import type { PublicAppointment, PublicProfile, Slot } from '@/services/types';
import { formatDate, formatDuration, formatMoney, formatTime } from '@/lib/format';
import { toE164 } from '@/lib/phone';
import { buildIcs, downloadIcs } from '@/lib/ics';
import { cn } from '@/lib/cn';
import { Alert, Button, Checkbox, Input } from '@/components/ui';
import { PhoneInput } from '@/components/PhoneInput';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { SlotPicker } from './SlotPicker';
import { Avatar } from './Avatar';

type Step = 'service' | 'staff' | 'time' | 'details' | 'done';

interface Props {
  profile: PublicProfile;
  initialServiceId?: string | null;
  onClose: () => void;
}

export function BookingFlow({ profile, initialServiceId, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { business } = profile;
  const locale = i18n.language;

  const [serviceId, setServiceId] = useState<string | null>(initialServiceId ?? null);
  const [staffId, setStaffId] = useState<string | 'any' | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [step, setStep] = useState<Step>(initialServiceId ? 'staff' : 'service');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState({ country: business.country, number: '' });
  const [consent, setConsent] = useState(true);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [result, setResult] = useState<PublicAppointment | null>(null);

  const service = profile.services.find((s) => s.id === serviceId) ?? null;
  const staffForService = useMemo(
    () => profile.staff.filter((s) => service?.staffIds.includes(s.id)),
    [profile.staff, service],
  );
  const chosenStaff =
    staffId && staffId !== 'any' ? profile.staff.find((s) => s.id === staffId) : null;

  const steps: Step[] = ['service', 'staff', 'time', 'details'];
  const stepIndex = steps.indexOf(step);

  const book = useMutation({
    mutationFn: (e164: string) =>
      api<PublicAppointment>(`/public/businesses/${business.slug}/appointments`, {
        auth: false,
        body: {
          serviceId,
          staffId: staffId === 'any' ? null : staffId,
          startsAt: slot!.startsAt,
          customerName: name.trim(),
          customerPhone: e164,
          whatsappConsent: consent,
          website: '',
        },
      }),
    onSuccess: (data) => {
      setResult(data);
      setStep('done');
      void qc.invalidateQueries({ queryKey: ['public-slots', business.slug] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'SLOT_UNAVAILABLE') {
        setSlot(null);
        setStep('time');
        void qc.invalidateQueries({ queryKey: ['public-slots', business.slug] });
      }
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = t('booking.errors.name');
    const e164 = toE164(phone.number, phone.country);
    if (!e164) next.phone = t('booking.errors.phone');
    setErrors(next);
    if (Object.keys(next).length === 0 && e164) book.mutate(e164);
  };

  const back = () => {
    if (stepIndex <= 0 || (step === 'staff' && initialServiceId)) onClose();
    else setStep(steps[stepIndex - 1]);
  };

  if (step === 'done' && result) return <Confirmation appt={result} onClose={onClose} />;

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <button
            type="button"
            onClick={back}
            className="-ml-2 rounded-full p-2 text-gray-700 hover:bg-gray-100"
            aria-label={t('common.back')}
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.83 10l3.94 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">
              {t(`booking.step.${step}`)}
            </p>
            <p className="text-xs text-gray-500">
              {t('booking.stepOf', { current: stepIndex + 1, total: steps.length })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
            aria-label={t('common.close')}
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
        <div className="mx-auto mt-3 flex max-w-xl gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <div
              key={s}
              className={cn(
                'h-1 flex-1 rounded-full transition',
                i <= stepIndex ? 'bg-brand' : 'bg-gray-200',
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-xl animate-fade-in" key={step}>
          {step === 'service' && (
            <ul className="space-y-2">
              {profile.services.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setServiceId(s.id);
                      setSlot(null);
                      setStaffId(null);
                      setStep('staff');
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-gray-200 transition hover:ring-brand',
                      serviceId === s.id && 'ring-2 ring-brand',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900">{s.name}</p>
                      <p className="text-sm text-gray-500">
                        {formatDuration(s.durationMinutes, locale)}
                      </p>
                    </div>
                    <p className="font-semibold text-gray-900">
                      {formatMoney(s.price, s.currency, locale)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {step === 'staff' && service && (
            <ul className="space-y-2">
              {staffForService.length > 1 && (
                <li>
                  <StaffOption
                    selected={staffId === 'any'}
                    title={t('booking.anyStaff')}
                    subtitle={t('booking.anyStaffHint')}
                    onClick={() => {
                      setStaffId('any');
                      setSlot(null);
                      setStep('time');
                    }}
                  />
                </li>
              )}
              {staffForService.map((s) => (
                <li key={s.id}>
                  <StaffOption
                    selected={staffId === s.id}
                    title={s.name}
                    subtitle={s.specialty}
                    photo={s.photoUrl}
                    onClick={() => {
                      setStaffId(s.id);
                      setSlot(null);
                      setStep('time');
                    }}
                  />
                </li>
              ))}
            </ul>
          )}

          {step === 'time' && service && (
            <>
              {book.error instanceof ApiError && book.error.code === 'SLOT_UNAVAILABLE' && (
                <div className="mb-4">
                  <Alert tone="amber">{t('booking.slotTaken')}</Alert>
                </div>
              )}
              <SlotPicker
                timezone={business.timezone}
                maxAdvanceDays={business.maxAdvanceDays}
                queryKey={['public-slots', business.slug, serviceId, staffId]}
                fetchDays={(from, to) =>
                  api(`/public/businesses/${business.slug}/availability`, {
                    auth: false,
                    query: {
                      serviceId,
                      from,
                      to,
                      staffId: staffId === 'any' ? undefined : staffId,
                    },
                  })
                }
                selected={slot}
                onSelect={(s) => {
                  setSlot(s);
                  setStep('details');
                }}
              />
            </>
          )}

          {step === 'details' && service && slot && (
            <form id="booking-details" onSubmit={submit} className="space-y-4" noValidate>
              <div className="rounded-2xl bg-brand-soft p-4 text-sm">
                <p className="font-semibold text-gray-900">{service.name}</p>
                <p className="mt-0.5 capitalize text-gray-700">
                  {formatDate(slot.startsAt, business.timezone, locale)} ·{' '}
                  {formatTime(slot.startsAt, business.timezone, locale)}
                </p>
                <p className="mt-0.5 text-gray-700">
                  {chosenStaff ? chosenStaff.name : t('booking.anyStaff')} ·{' '}
                  {formatMoney(service.price, service.currency, locale)}
                </p>
                <button
                  type="button"
                  className="mt-2 font-semibold text-brand-ink"
                  onClick={() => setStep('time')}
                >
                  {t('booking.changeTime')}
                </button>
              </div>
              <Input
                label={t('booking.name')}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={errors.name}
                maxLength={80}
              />
              <PhoneInput
                label={t('booking.whatsapp')}
                country={phone.country}
                number={phone.number}
                onChange={setPhone}
                error={errors.phone}
                hint={t('booking.phoneHint')}
              />
              <Checkbox
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                label={t('booking.consent')}
              />
              {book.isError &&
                !(book.error instanceof ApiError && book.error.code === 'SLOT_UNAVAILABLE') && (
                  <Alert>{errorMessage(book.error)}</Alert>
                )}
              <p className="text-xs text-gray-500">
                {t('booking.policy', { hours: Math.round(business.cancelWindowMinutes / 60) })}
              </p>
            </form>
          )}
        </div>
      </div>

      {step === 'details' && (
        <div className="safe-bottom border-t border-gray-100 bg-white px-4 py-3">
          <div className="mx-auto max-w-xl">
            <Button form="booking-details" type="submit" size="lg" block loading={book.isPending}>
              {t('booking.confirm')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffOption({
  selected,
  title,
  subtitle,
  photo,
  onClick,
}: {
  selected: boolean;
  title: string;
  subtitle?: string | null;
  photo?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-gray-200 transition hover:ring-brand',
        selected && 'ring-2 ring-brand',
      )}
    >
      <Avatar name={title} url={photo} any={!photo && photo !== null} />
      <div className="min-w-0">
        <p className="font-semibold text-gray-900">{title}</p>
        {subtitle && <p className="truncate text-sm text-gray-500">{subtitle}</p>}
      </div>
    </button>
  );
}

function Confirmation({ appt, onClose }: { appt: PublicAppointment; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const manageUrl = `${window.location.origin}/m/${appt.manageToken}`;
  const [copied, setCopied] = useState(false);
  const addToCalendar = () =>
    downloadIcs(
      'cita.ics',
      buildIcs({
        uid: `${appt.id}@booking`,
        title: `${appt.service?.name ?? ''} — ${appt.business.name}`,
        start: appt.startsAt,
        end: appt.endsAt,
        location: appt.branch.address,
        description: manageUrl,
      }),
    );

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-10">
      <div className="mx-auto w-full max-w-md animate-slide-up text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <svg
            className="h-8 w-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden
          >
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="mt-4 text-2xl font-bold text-gray-900">{t('booking.confirmedTitle')}</h2>
        <p className="mt-1 text-gray-600">
          {t('booking.confirmedSubtitle', { name: appt.customerName })}
        </p>

        <div className="mt-6 rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-gray-200">
          <dl className="space-y-3 text-sm">
            <Row label={t('booking.summary.service')} value={appt.service?.name} />
            <Row
              label={t('booking.summary.when')}
              value={`${formatDate(appt.startsAt, appt.timezone, locale)} · ${formatTime(appt.startsAt, appt.timezone, locale)}`}
            />
            <Row label={t('booking.summary.with')} value={appt.staff.name} />
            {appt.branch.address && (
              <Row label={t('booking.summary.where')} value={appt.branch.address} />
            )}
            {appt.price && appt.currency && (
              <Row
                label={t('booking.summary.price')}
                value={formatMoney(appt.price, appt.currency, locale)}
              />
            )}
          </dl>
          <p className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
            {t('booking.payAtBusiness')}
          </p>
        </div>

        <div className="mt-6 space-y-2">
          <Button block size="lg" onClick={addToCalendar}>
            {t('booking.addToCalendar')}
          </Button>
          <Button
            block
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard?.writeText(manageUrl).catch(() => undefined);
              setCopied(true);
            }}
          >
            {copied ? t('booking.linkCopied') : t('booking.copyManageLink')}
          </Button>
          <a href={manageUrl} className="block py-2 text-sm font-semibold text-brand-ink">
            {t('booking.manageNow')}
          </a>
          <button
            type="button"
            onClick={onClose}
            className="block w-full py-2 text-sm text-gray-500"
          >
            {t('common.close')}
          </button>
        </div>
        <p className="mt-4 text-xs text-gray-500">{t('booking.saveLinkHint')}</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900 first-letter:uppercase">{value}</dd>
    </div>
  );
}
