import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api';
import type { WouldReturn } from '@/services/types';
import { useBrandTheme } from '@/hooks/useBrandTheme';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { hasExplicitLanguage, setLanguage } from '@/i18n';
import { cn } from '@/lib/cn';
import { Alert, Button, PageLoader, Textarea } from '@/components/ui';

interface Survey {
  state: 'OPEN' | 'ANSWERED' | 'EXPIRED';
  business: {
    name: string;
    slug: string;
    primaryColor: string;
    logoUrl: string | null;
    locale: string;
  };
  staffName: string;
  serviceName: string | null;
}

export function FeedbackPage() {
  const { token = '' } = useParams();
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [rating, setRating] = useState(0);
  const [wouldReturn, setWouldReturn] = useState<WouldReturn | null>(null);
  const [comment, setComment] = useState('');

  const q = useQuery({
    queryKey: ['survey', token],
    queryFn: () => api<Survey>(`/public/feedback/${token}`, { auth: false }),
    retry: false,
  });
  useBrandTheme(q.data?.business.primaryColor);
  useEffect(() => {
    if (q.data && !hasExplicitLanguage()) setLanguage(q.data.business.locale, false);
  }, [q.data]);

  const submit = useMutation({
    mutationFn: () =>
      api(`/public/feedback/${token}`, {
        auth: false,
        body: { rating, wouldReturn, comment: comment.trim() || undefined },
      }),
  });

  if (q.isLoading) return <PageLoader label={t('common.loading')} />;
  const s = q.data;
  if (!s) return <Centered title={t('survey.notFound')} />;
  if (submit.isSuccess || s.state === 'ANSWERED')
    return (
      <Centered
        title={t('survey.thanksTitle')}
        text={t('survey.thanksText', { name: s.business.name })}
        success
      />
    );
  if (s.state === 'EXPIRED') return <Centered title={t('survey.expired')} />;

  const options: { value: WouldReturn; label: string }[] = [
    { value: 'YES', label: t('survey.yes') },
    { value: 'MAYBE', label: t('survey.maybe') },
    { value: 'NO', label: t('survey.no') },
  ];

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 py-8">
      <div className="text-center">
        {s.business.logoUrl && (
          <img
            src={s.business.logoUrl}
            alt=""
            className="mx-auto mb-3 h-14 w-14 rounded-2xl object-cover"
          />
        )}
        <p className="text-sm font-semibold text-brand-ink">{s.business.name}</p>
        <p className="mt-1 text-sm text-gray-500">
          {[s.serviceName, s.staffName].filter(Boolean).join(' · ')}
        </p>
      </div>

      <form
        className="mt-8 space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (rating && wouldReturn) submit.mutate();
        }}
      >
        <fieldset>
          <legend className="text-center text-lg font-semibold text-gray-900">
            {t('survey.q1')}
          </legend>
          <div
            className="mt-4 flex justify-center gap-2"
            role="radiogroup"
            aria-label={t('survey.q1')}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={t('survey.stars', { count: n })}
                onClick={() => setRating(n)}
                className="rounded-full p-1 transition active:scale-90"
              >
                <svg
                  viewBox="0 0 24 24"
                  className={cn('h-11 w-11', n <= rating ? 'text-amber-400' : 'text-gray-200')}
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.13 5.11a.56.56 0 0 0 .47.34l5.52.44c.5.04.7.66.32.99l-4.2 3.6a.56.56 0 0 0-.18.56l1.28 5.38a.56.56 0 0 1-.84.61l-4.73-2.89a.56.56 0 0 0-.58 0l-4.73 2.89a.56.56 0 0 1-.84-.61l1.28-5.38a.56.56 0 0 0-.18-.56l-4.2-3.6a.56.56 0 0 1 .32-.99l5.52-.44a.56.56 0 0 0 .47-.34l2.13-5.11Z" />
                </svg>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-center text-lg font-semibold text-gray-900">
            {t('survey.q2')}
          </legend>
          <div
            className="mt-4 grid grid-cols-3 gap-2"
            role="radiogroup"
            aria-label={t('survey.q2')}
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={wouldReturn === o.value}
                onClick={() => setWouldReturn(o.value)}
                className={cn(
                  'h-12 rounded-xl font-semibold ring-1 transition',
                  wouldReturn === o.value
                    ? 'bg-brand text-brand-fg ring-brand'
                    : 'bg-white text-gray-900 ring-gray-200',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </fieldset>

        <Textarea
          label={t('survey.q3')}
          hint={t('common.optional')}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
        />
        {submit.isError && <Alert>{errorMessage(submit.error)}</Alert>}
        <Button
          type="submit"
          size="lg"
          block
          disabled={!rating || !wouldReturn}
          loading={submit.isPending}
        >
          {t('survey.submit')}
        </Button>
        <p className="text-center text-xs text-gray-500">{t('survey.privacy')}</p>
      </form>
    </div>
  );
}

function Centered({ title, text, success }: { title: string; text?: string; success?: boolean }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      {success && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
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
      )}
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      {text && <p className="mt-2 text-gray-500">{text}</p>}
    </div>
  );
}
