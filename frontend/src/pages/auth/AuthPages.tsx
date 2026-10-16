import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/AuthContext';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { Alert, Button, Card, Input } from '@/components/ui';
import { BusinessFields, type RegionalValues } from '@/features/catalog/BusinessFields';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { COUNTRY_DEFAULTS } from '@/lib/regions';

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Link to="/" className="mb-6 text-xl font-bold text-gray-900">
        {import.meta.env.VITE_PRODUCT_NAME ?? 'Agenda'}
      </Link>
      <Card className="w-full max-w-lg p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Card>
    </div>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (status === 'authenticated') return <Navigate to="/app" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/app');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell
      title={t('auth.loginTitle')}
      subtitle={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-semibold text-brand-ink">
            {t('auth.registerLink')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" block size="lg" loading={loading}>
          {t('auth.login')}
        </Button>
      </form>
    </Shell>
  );
}

export function RegisterPage() {
  const { t, i18n } = useTranslation();
  const { register, status } = useAuth();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [form, setForm] = useState({ name: '', email: '', password: '', businessName: '' });
  const [regional, setRegional] = useState<RegionalValues>(() => {
    const country =
      Object.entries(COUNTRY_DEFAULTS).find(([, d]) => d.timezone === guess)?.[0] ?? 'MX';
    return {
      type: 'BARBERSHOP',
      country,
      ...COUNTRY_DEFAULTS[country],
      timezone: guess || COUNTRY_DEFAULTS[country].timezone,
      locale: i18n.language.slice(0, 2),
    };
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (status === 'authenticated') return <Navigate to="/app" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password.length < 10) return setError(t('auth.passwordHint'));
    setLoading(true);
    try {
      const { businessId } = await register({
        name: form.name,
        email: form.email,
        password: form.password,
        preferredLocale: i18n.language.slice(0, 2),
        business: { name: form.businessName, ...regional },
      });
      navigate(`/app/${businessId}/onboarding`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell
      title={t('auth.registerTitle')}
      subtitle={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-semibold text-brand-ink">
            {t('auth.loginLink')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={t('auth.businessName')}
          required
          minLength={2}
          maxLength={80}
          value={form.businessName}
          onChange={(e) => setForm({ ...form, businessName: e.target.value })}
        />
        <BusinessFields value={regional} onChange={setRegional} />
        <hr className="border-gray-100" />
        <Input
          label={t('auth.yourName')}
          required
          autoComplete="name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Input
          label={t('auth.email')}
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          label={t('auth.password')}
          type="password"
          required
          autoComplete="new-password"
          minLength={10}
          hint={t('auth.passwordHint')}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" block size="lg" loading={loading}>
          {t('auth.createBusiness')}
        </Button>
        <p className="text-center text-xs text-gray-500">{t('auth.noCardNeeded')}</p>
      </form>
    </Shell>
  );
}
