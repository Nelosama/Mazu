import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl font-bold text-gray-300">404</p>
      <h1 className="mt-3 text-xl font-semibold text-gray-900">{t('notFound.title')}</h1>
      <p className="mt-1 text-gray-500">{t('notFound.text')}</p>
      <Link to="/" className="mt-6 text-sm font-semibold text-brand-ink">
        {t('notFound.home')}
      </Link>
    </div>
  );
}
