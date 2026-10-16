import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useBusiness, useServiceList, useStaffList } from '@/hooks/useBusiness';
import { cn } from '@/lib/cn';
import { Card, PageHeader } from '@/components/ui';

/** Lista guiada: servicio → profesional → compartir enlace. */
export function OnboardingPage() {
  const { t } = useTranslation();
  const { businessId, business } = useBusiness();
  const services = useServiceList(businessId).data ?? [];
  const staff = useStaffList(businessId).data ?? [];
  const base = `/app/${businessId}`;
  const steps = [
    {
      done: services.length > 0,
      title: t('onboarding.service'),
      text: t('onboarding.serviceText'),
      to: `${base}/services`,
    },
    {
      done: staff.length > 0,
      title: t('onboarding.staff'),
      text: t('onboarding.staffText'),
      to: `${base}/staff`,
    },
    {
      done: false,
      title: t('onboarding.share'),
      text: t('onboarding.shareText'),
      to: `/b/${business?.slug ?? ''}`,
    },
  ];
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={t('onboarding.title', { name: business?.name ?? '' })}
        subtitle={t('onboarding.subtitle')}
      />
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i}>
            <Link to={s.to} target={i === 2 ? '_blank' : undefined}>
              <Card className="flex items-center gap-4 p-4 transition hover:ring-brand">
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    s.done ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-soft text-brand-ink',
                  )}
                >
                  {s.done ? '✓' : i + 1}
                </span>
                <div>
                  <p className="font-semibold text-gray-900">{s.title}</p>
                  <p className="text-sm text-gray-500">{s.text}</p>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ol>
      <Link
        to={`${base}/agenda`}
        className="mt-6 inline-block text-sm font-semibold text-brand-ink"
      >
        {t('onboarding.goAgenda')} →
      </Link>
    </div>
  );
}
