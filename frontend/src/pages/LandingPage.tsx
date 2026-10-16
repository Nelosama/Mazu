import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useAuth } from '@/features/auth/AuthContext';

export function LandingPage() {
  const { t } = useTranslation();
  const { status } = useAuth();
  const name = import.meta.env.VITE_PRODUCT_NAME ?? 'Agenda';
  const features = ['booking', 'agenda', 'feedback', 'global'] as const;
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <span className="text-lg font-bold">{name}</span>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link
            to={status === 'authenticated' ? '/app' : '/login'}
            className="text-sm font-semibold text-gray-700"
          >
            {status === 'authenticated' ? t('landing.goPanel') : t('auth.login')}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4">
        <section className="py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            {t('landing.title')}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-gray-600">{t('landing.subtitle')}</p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex h-12 items-center rounded-xl bg-brand px-6 font-semibold text-brand-fg shadow-sm hover:brightness-110"
            >
              {t('landing.cta')}
            </Link>
          </div>
          <p className="mt-3 text-sm text-gray-500">{t('landing.forWho')}</p>
        </section>
        <section className="grid gap-4 pb-20 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f} className="rounded-2xl bg-gray-50 p-6">
              <h2 className="font-semibold text-gray-900">{t(`landing.features.${f}.title`)}</h2>
              <p className="mt-1 text-sm text-gray-600">{t(`landing.features.${f}.text`)}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
