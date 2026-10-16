import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api';
import { useAuth } from '@/features/auth/AuthContext';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { Alert, Button, Card, Input } from '@/components/ui';
import { BusinessFields, type RegionalValues } from '@/features/catalog/BusinessFields';

export function BusinessPickerPage() {
  const { t } = useTranslation();
  const { me, reload, logout } = useAuth();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [regional, setRegional] = useState<RegionalValues>({
    type: 'BARBERSHOP',
    country: 'MX',
    currency: 'MXN',
    timezone: 'America/Mexico_City',
    locale: 'es',
  });
  const create = useMutation({
    mutationFn: () => api<{ id: string }>('/businesses', { body: { name, ...regional } }),
    onSuccess: async (b) => {
      await reload();
      navigate(`/app/${b.id}/onboarding`);
    },
  });

  if (!me) return null;
  if (me.memberships.length === 1 && !creating)
    return <Navigate to={`/app/${me.memberships[0].business.id}/agenda`} replace />;

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900">{t('picker.title')}</h1>
      <p className="mt-1 text-sm text-gray-500">{t('picker.subtitle', { name: me.user.name })}</p>
      <ul className="mt-6 space-y-2">
        {me.memberships.map((m) => (
          <li key={m.business.id}>
            <Link to={`/app/${m.business.id}/agenda`}>
              <Card className="flex items-center justify-between p-4 hover:ring-gray-300">
                <div>
                  <p className="font-semibold text-gray-900">{m.business.name}</p>
                  <p className="text-sm text-gray-500">
                    {t(`roles.${m.role}`)} · {m.business.slug}
                  </p>
                </div>
                <span aria-hidden>→</span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      {me.isPlatformAdmin && (
        <Link to="/admin" className="mt-4 block text-sm font-semibold text-brand-ink">
          {t('nav.superAdmin')} →
        </Link>
      )}
      {creating ? (
        <Card className="mt-6 space-y-4 p-5">
          <Input
            label={t('auth.businessName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <BusinessFields value={regional} onChange={setRegional} />
          {create.isError && <Alert>{errorMessage(create.error)}</Alert>}
          <Button
            block
            loading={create.isPending}
            disabled={name.length < 2}
            onClick={() => create.mutate()}
          >
            {t('auth.createBusiness')}
          </Button>
        </Card>
      ) : (
        <Button variant="secondary" className="mt-6" onClick={() => setCreating(true)}>
          {t('picker.create')}
        </Button>
      )}
      <button
        type="button"
        onClick={() => void logout()}
        className="mt-8 block text-sm text-gray-500"
      >
        {t('nav.logout')}
      </button>
    </div>
  );
}
