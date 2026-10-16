import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/services/api';
import type { PublicProfile } from '@/services/types';
import { useBrandTheme } from '@/hooks/useBrandTheme';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { formatDuration, formatMoney } from '@/lib/format';
import { hasExplicitLanguage, setLanguage } from '@/i18n';
import { Button, PageLoader } from '@/components/ui';
import { BookingFlow } from '@/features/booking/BookingFlow';
import { Avatar } from '@/features/booking/Avatar';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { NotFoundPage } from '../NotFoundPage';

export function BusinessPage() {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [booking, setBooking] = useState<{ serviceId: string | null } | null>(null);

  const q = useQuery({
    queryKey: ['public-profile', slug],
    queryFn: () => api<PublicProfile>(`/public/businesses/${slug}`, { auth: false }),
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  });
  const profile = q.data;
  useBrandTheme(profile?.business.primaryColor);
  useDocumentMeta(
    profile?.business.name,
    profile?.business.description,
    profile?.business.coverUrl ?? profile?.business.logoUrl,
  );

  // Idioma del negocio por defecto, salvo que la persona haya elegido uno.
  useEffect(() => {
    if (profile && !hasExplicitLanguage()) setLanguage(profile.business.locale, false);
  }, [profile]);

  if (q.isLoading) return <PageLoader label={t('common.loading')} />;
  if (q.error instanceof ApiError && q.error.status === 404) return <NotFoundPage />;
  if (!profile) return <div className="p-8 text-center text-red-600">{t('errors.GENERIC')}</div>;

  const { business, services, staff, portfolio, branches } = profile;
  const locale = i18n.language;
  const open = (serviceId: string | null = null) => setBooking({ serviceId });
  const close = () => {
    setBooking(null);
    if (params.get('reservar')) setParams({}, { replace: true });
  };

  // Deep link: /b/slug?reservar=1&servicio=<id>
  const active = booking ?? (params.get('reservar') ? { serviceId: params.get('servicio') } : null);
  if (active) {
    return (
      <div className="fixed inset-0 z-40 bg-gray-50">
        <BookingFlow profile={profile} initialServiceId={active.serviceId} onClose={close} />
      </div>
    );
  }

  const categories = [...new Set(services.map((s) => s.category ?? ''))];

  return (
    <div className="min-h-screen pb-28">
      <header className="relative">
        <div className="h-44 w-full overflow-hidden bg-brand sm:h-64">
          {business.coverUrl ? (
            <img
              src={business.coverUrl}
              alt=""
              className="h-full w-full object-cover"
              fetchPriority="high"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-brand to-brand-ink opacity-90" />
          )}
        </div>
        <div className="absolute right-3 top-3">
          <LanguageSwitcher compact />
        </div>
        <div className="mx-auto -mt-12 max-w-3xl px-4">
          <div className="flex items-end gap-4">
            {business.logoUrl ? (
              <img
                src={business.logoUrl}
                alt={t('public.logoAlt', { name: business.name })}
                className="h-24 w-24 rounded-3xl bg-white object-cover shadow-lg ring-4 ring-white"
              />
            ) : (
              <div
                className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white text-3xl font-bold text-brand-ink shadow-lg ring-4 ring-white"
                aria-hidden
              >
                {business.name[0]}
              </div>
            )}
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">{business.name}</h1>
          <p className="mt-1 text-sm font-medium text-brand-ink">
            {t(`businessTypes.${business.type}`)}
          </p>
          {business.description && (
            <p className="mt-3 whitespace-pre-line text-gray-600">{business.description}</p>
          )}
          {branches[0]?.address && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-gray-500">
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="m9.69 18.93.01.01a.75.75 0 0 0 .6 0l.01-.01.04-.02a16 16 0 0 0 2.63-1.84C14.97 15.4 17 12.86 17 9.5a7 7 0 1 0-14 0c0 3.36 2.03 5.9 4.02 7.57a16 16 0 0 0 2.63 1.84l.04.02ZM10 11.25a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z"
                  clipRule="evenodd"
                />
              </svg>
              {branches[0].address}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto mt-8 max-w-3xl space-y-10 px-4">
        <section aria-labelledby="services-title">
          <h2 id="services-title" className="mb-3 text-lg font-bold text-gray-900">
            {t('public.services')}
          </h2>
          {services.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 ring-1 ring-gray-200">
              {t('public.noServices')}
            </p>
          ) : (
            categories.map((cat) => (
              <div key={cat || 'none'} className="mb-4">
                {cat && (
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {cat}
                  </h3>
                )}
                <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200">
                  {services
                    .filter((s) => (s.category ?? '') === cat)
                    .map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => open(s.id)}
                          className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-gray-50"
                        >
                          {s.photoUrl && (
                            <img
                              src={s.photoUrl}
                              alt=""
                              loading="lazy"
                              className="h-16 w-16 shrink-0 rounded-xl object-cover"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-900">{s.name}</p>
                            {s.description && (
                              <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">
                                {s.description}
                              </p>
                            )}
                            <p className="mt-1 text-sm text-gray-500">
                              {formatDuration(s.durationMinutes, locale)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-gray-900">
                              {formatMoney(s.price, s.currency, locale)}
                            </p>
                            <span className="mt-1 inline-block rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-ink">
                              {t('public.book')}
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))
          )}
        </section>

        {staff.length > 0 && (
          <section aria-labelledby="team-title">
            <h2 id="team-title" className="mb-3 text-lg font-bold text-gray-900">
              {t('public.team')}
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {staff.map((s) => (
                <li
                  key={s.id}
                  className="rounded-2xl bg-white p-4 text-center ring-1 ring-gray-200"
                >
                  <div className="flex justify-center">
                    <Avatar name={s.name} url={s.photoUrl} size="lg" />
                  </div>
                  <p className="mt-3 font-semibold text-gray-900">{s.name}</p>
                  {s.specialty && <p className="text-sm text-gray-500">{s.specialty}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {portfolio.length > 0 && (
          <section aria-labelledby="portfolio-title">
            <h2 id="portfolio-title" className="mb-3 text-lg font-bold text-gray-900">
              {t('public.portfolio')}
            </h2>
            <ul className="grid grid-cols-3 gap-1.5 overflow-hidden rounded-2xl">
              {portfolio.map((p) => (
                <li key={p.id} className="aspect-square bg-gray-100">
                  <img
                    src={p.url}
                    alt={p.caption ?? ''}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="pb-4 text-center text-xs text-gray-400">{t('public.poweredBy')}</footer>
      </main>

      {services.length > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            <Button size="lg" block onClick={() => open()}>
              {t('public.bookNow')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
