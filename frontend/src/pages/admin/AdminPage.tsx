import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api';
import type { Plan } from '@/services/types';
import { useAuth } from '@/features/auth/AuthContext';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { bytes } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  PageLoader,
  Sheet,
  useToast,
} from '@/components/ui';
import { BusinessFields, type RegionalValues } from '@/features/catalog/BusinessFields';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

type Tab = 'overview' | 'businesses' | 'plans' | 'incidents' | 'audit';

interface Metrics {
  businesses: { active: number; suspended: number };
  activeStaff: number;
  appointments: { last30Days: number; total: number };
  storageBytes: number;
  feedbackResponses: number;
  failedNotifications30d: number;
  openIncidents: number;
  subscriptionsByPlan: { plan: string; count: number }[];
  notificationProviders: { WHATSAPP: string | null; EMAIL: string | null; devLog: boolean };
}

interface AdminBusiness {
  id: string;
  name: string;
  slug: string;
  country: string;
  status: 'ACTIVE' | 'SUSPENDED';
  plan: { code: string; name: string } | null;
  subscriptionStatus: string | null;
  activeStaff: number;
  appointments30d: number;
  storageBytes: number;
  createdAt: string;
}

export function AdminPage() {
  const { t } = useTranslation();
  const { me, status } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  if (status === 'loading') return <PageLoader label={t('common.loading')} />;
  if (!me?.isPlatformAdmin) return <Navigate to="/app" replace />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-gray-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <p className="font-bold">{t('admin.title')}</p>
          <div className="flex items-center gap-3 text-sm">
            <LanguageSwitcher compact />
            <Link to="/app" className="text-gray-300 hover:text-white">
              {t('admin.backToApp')}
            </Link>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4" role="tablist">
          {(['overview', 'businesses', 'plans', 'incidents', 'audit'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                'whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium',
                tab === k
                  ? 'border-white text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200',
              )}
            >
              {t(`admin.tabs.${k}`)}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <p className="mb-4 text-xs text-gray-500">{t('admin.privacyNote')}</p>
        {tab === 'overview' && <Overview />}
        {tab === 'businesses' && <Businesses />}
        {tab === 'plans' && <Plans />}
        {tab === 'incidents' && <Incidents />}
        {tab === 'audit' && <Audit />}
      </main>
    </div>
  );
}

function Overview() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: () => api<Metrics>('/admin/metrics'),
  });
  if (!q.data) return <PageLoader label={t('common.loading')} />;
  const m = q.data;
  const cards = [
    [t('admin.m.activeBusinesses'), m.businesses.active],
    [t('admin.m.suspended'), m.businesses.suspended],
    [t('admin.m.staff'), m.activeStaff],
    [t('admin.m.appointments30'), m.appointments.last30Days],
    [t('admin.m.storage'), bytes(m.storageBytes)],
    [t('admin.m.feedback'), m.feedbackResponses],
    [t('admin.m.failedNotifications'), m.failedNotifications30d],
    [t('admin.m.openIncidents'), m.openIncidents],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          </Card>
        ))}
      </div>
      <Card className="p-4 text-sm">
        <p className="font-semibold">{t('admin.providers')}</p>
        <p className="mt-1 text-gray-600">
          WhatsApp: {m.notificationProviders.WHATSAPP ?? t('admin.notConfigured')} · Email:{' '}
          {m.notificationProviders.EMAIL ?? t('admin.notConfigured')}
          {m.notificationProviders.devLog ? ` · ${t('admin.devLog')}` : ''}
        </p>
        <p className="mt-3 font-semibold">{t('admin.byPlan')}</p>
        <p className="mt-1 text-gray-600">
          {m.subscriptionsByPlan.map((p) => `${p.plan}: ${p.count}`).join(' · ') || '—'}
        </p>
      </Card>
    </div>
  );
}

function Businesses() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const q = useQuery({
    queryKey: ['admin-businesses', search],
    queryFn: () => api<AdminBusiness[]>('/admin/businesses', { query: { q: search } }),
  });
  const plans = useQuery({ queryKey: ['admin-plans'], queryFn: () => api<Plan[]>('/admin/plans') });
  const setStatus = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason: string }) =>
      api(`/admin/businesses/${id}/status`, { method: 'PATCH', body: { status, reason } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-businesses'] }),
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const setPlan = useMutation({
    mutationFn: ({ id, planCode }: { id: string; planCode: string }) =>
      api(`/admin/businesses/${id}/subscription`, { method: 'PATCH', body: { planCode } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-businesses'] });
      toast(t('common.saved'));
    },
  });

  return (
    <div>
      <PageHeader
        title={t('admin.tabs.businesses')}
        actions={<Button onClick={() => setCreating(true)}>{t('admin.createBusiness')}</Button>}
      />
      <Input
        placeholder={t('admin.search')}
        aria-label={t('admin.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        wrapperClassName="mb-4 max-w-sm"
      />
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-gray-200">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t('admin.business')}</th>
              <th className="px-4 py-3 font-medium">{t('admin.plan')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('admin.m.staff')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('admin.m.appointments30')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('admin.m.storage')}</th>
              <th className="px-4 py-3 font-medium">{t('admin.status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(q.data ?? []).map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{b.name}</p>
                  <p className="text-xs text-gray-500">
                    /{b.slug} · {b.country} ·{' '}
                    {new Date(b.createdAt).toLocaleDateString(i18n.language)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <select
                    aria-label={t('admin.plan')}
                    value={b.plan?.code ?? ''}
                    onChange={(e) => setPlan.mutate({ id: b.id, planCode: e.target.value })}
                    className="h-8 rounded-lg border-0 py-0 pl-2 pr-7 text-sm ring-1 ring-gray-300"
                  >
                    {(plans.data ?? []).map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {b.subscriptionStatus && (
                    <span className="ml-2 text-xs text-gray-500">{b.subscriptionStatus}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{b.activeStaff}</td>
                <td className="px-4 py-3 text-right tabular-nums">{b.appointments30d}</td>
                <td className="px-4 py-3 text-right tabular-nums">{bytes(b.storageBytes)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={b.status === 'ACTIVE' ? 'green' : 'red'}>
                      {t(`admin.statuses.${b.status}`)}
                    </Badge>
                    <button
                      type="button"
                      className="text-xs font-semibold text-gray-600 hover:text-gray-900"
                      onClick={() => {
                        const reason = window.prompt(t('admin.reasonPrompt'));
                        if (reason && reason.length >= 3)
                          setStatus.mutate({
                            id: b.id,
                            status: b.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                            reason,
                          });
                      }}
                    >
                      {b.status === 'ACTIVE' ? t('admin.suspend') : t('admin.activate')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CreateBusinessSheet
        open={creating}
        onClose={() => setCreating(false)}
        plans={plans.data ?? []}
      />
    </div>
  );
}

function CreateBusinessSheet({
  open,
  onClose,
  plans,
}: {
  open: boolean;
  onClose: () => void;
  plans: Plan[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errorMessage = useErrorMessage();
  const [owner, setOwner] = useState({ name: '', email: '' });
  const [name, setName] = useState('');
  const [planCode, setPlanCode] = useState('STARTER');
  const [regional, setRegional] = useState<RegionalValues>({
    type: 'BARBERSHOP',
    country: 'MX',
    currency: 'MXN',
    timezone: 'America/Mexico_City',
    locale: 'es',
  });
  const [result, setResult] = useState<{
    temporaryPassword: string | null;
    business: { slug: string };
  } | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api<{ temporaryPassword: string | null; business: { slug: string } }>('/admin/businesses', {
        body: { owner, business: { name, ...regional }, planCode },
      }),
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: ['admin-businesses'] });
    },
  });
  const close = () => {
    setResult(null);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      title={t('admin.createBusiness')}
      closeLabel={t('common.close')}
      size="lg"
      footer={
        !result && (
          <Button block loading={create.isPending} onClick={() => create.mutate()}>
            {t('admin.create')}
          </Button>
        )
      }
    >
      {result ? (
        <div className="space-y-3 text-sm">
          <Alert tone="green">{t('admin.created', { slug: result.business.slug })}</Alert>
          {result.temporaryPassword && (
            <p>
              {t('admin.tempPassword')}:{' '}
              <code className="rounded bg-gray-100 px-2 py-1">{result.temporaryPassword}</code>
            </p>
          )}
          <p className="text-xs text-gray-500">{t('admin.tempPasswordHint')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            label={t('auth.businessName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <BusinessFields value={regional} onChange={setRegional} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('admin.ownerName')}
              value={owner.name}
              onChange={(e) => setOwner({ ...owner, name: e.target.value })}
            />
            <Input
              label={t('admin.ownerEmail')}
              type="email"
              value={owner.email}
              onChange={(e) => setOwner({ ...owner, email: e.target.value })}
            />
          </div>
          <label className="block text-sm font-medium text-gray-700">
            {t('admin.plan')}
            <select
              value={planCode}
              onChange={(e) => setPlanCode(e.target.value)}
              className="mt-1.5 block h-11 w-full rounded-xl border-0 ring-1 ring-gray-300"
            >
              {plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {create.isError && <Alert>{errorMessage(create.error)}</Alert>}
        </div>
      )}
    </Sheet>
  );
}

function Plans() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const q = useQuery({ queryKey: ['admin-plans'], queryFn: () => api<Plan[]>('/admin/plans') });
  const save = useMutation({
    mutationFn: (p: Plan) =>
      api(`/admin/plans/${p.id}`, {
        method: 'PATCH',
        body: {
          name: p.name,
          monthlyPrice: p.monthlyPrice,
          currency: p.currency,
          maxStaff: p.maxStaff,
          maxBranches: p.maxBranches,
          maxMonthlyBookings: p.maxMonthlyBookings,
          customBranding: p.customBranding,
          satisfactionReports: p.satisfactionReports,
          advancedReports: p.advancedReports,
          isActive: p.isActive,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-plans'] });
      toast(t('common.saved'));
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  if (!q.data) return <PageLoader label={t('common.loading')} />;
  return (
    <div>
      <Alert tone="blue">{t('admin.plansNote')}</Alert>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {q.data.map((p) => (
          <PlanCard key={p.id} plan={p} onSave={(x) => save.mutate(x)} saving={save.isPending} />
        ))}
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  onSave,
  saving,
}: {
  plan: Plan;
  onSave: (p: Plan) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [p, setP] = useState(plan);
  const num = (v: string) => (v === '' ? null : Number(v));
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="font-bold">{p.code}</p>
        <Badge>{t('admin.subscriptions', { count: plan.subscriptions ?? 0 })}</Badge>
      </div>
      <Input
        label={t('admin.planName')}
        value={p.name}
        onChange={(e) => setP({ ...p, name: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          label={t('admin.price')}
          value={p.monthlyPrice}
          onChange={(e) => setP({ ...p, monthlyPrice: e.target.value })}
        />
        <Input
          label={t('auth.currency')}
          value={p.currency}
          maxLength={3}
          onChange={(e) => setP({ ...p, currency: e.target.value.toUpperCase() })}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Input
          label={t('admin.maxStaff')}
          type="number"
          value={p.maxStaff ?? ''}
          placeholder="∞"
          onChange={(e) => setP({ ...p, maxStaff: num(e.target.value) })}
        />
        <Input
          label={t('admin.maxBranches')}
          type="number"
          value={p.maxBranches ?? ''}
          placeholder="∞"
          onChange={(e) => setP({ ...p, maxBranches: num(e.target.value) })}
        />
        <Input
          label={t('admin.maxBookings')}
          type="number"
          value={p.maxMonthlyBookings ?? ''}
          placeholder="∞"
          onChange={(e) => setP({ ...p, maxMonthlyBookings: num(e.target.value) })}
        />
      </div>
      {(['customBranding', 'satisfactionReports', 'advancedReports', 'isActive'] as const).map(
        (k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={p[k]}
              onChange={(e) => setP({ ...p, [k]: e.target.checked })}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            {t(`admin.features.${k}`)}
          </label>
        ),
      )}
      <Button size="sm" block loading={saving} onClick={() => onSave(p)}>
        {t('common.save')}
      </Button>
    </Card>
  );
}

function Incidents() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-incidents'],
    queryFn: () =>
      api<
        {
          id: string;
          source: string;
          severity: string;
          message: string;
          occurrences: number;
          lastSeenAt: string;
        }[]
      >('/admin/incidents'),
  });
  const resolve = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/incidents/${id}/resolve`, { method: 'PATCH', body: {} }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-incidents'] }),
  });
  if (!q.data) return <PageLoader label={t('common.loading')} />;
  if (!q.data.length)
    return (
      <p className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 ring-1 ring-gray-200">
        {t('admin.noIncidents')}
      </p>
    );
  return (
    <ul className="space-y-2">
      {q.data.map((i) => (
        <li
          key={i.id}
          className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-gray-200"
        >
          <Badge tone={i.severity === 'ERROR' ? 'red' : 'amber'}>{i.source}</Badge>
          <code className="min-w-0 flex-1 truncate text-sm">{i.message}</code>
          <span className="text-xs text-gray-500">
            ×{i.occurrences} · {new Date(i.lastSeenAt).toLocaleString(i18n.language)}
          </span>
          <Button size="sm" variant="secondary" onClick={() => resolve.mutate(i.id)}>
            {t('admin.resolve')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function Audit() {
  const { t, i18n } = useTranslation();
  const q = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () =>
      api<
        {
          id: string;
          action: string;
          targetType: string | null;
          createdAt: string;
          ip: string | null;
          actor: { email: string } | null;
          businessId: string | null;
        }[]
      >('/admin/audit'),
  });
  if (!q.data) return <PageLoader label={t('common.loading')} />;
  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-gray-200">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2">{t('admin.when')}</th>
            <th className="px-4 py-2">{t('admin.action')}</th>
            <th className="px-4 py-2">{t('admin.actor')}</th>
            <th className="px-4 py-2">{t('admin.business')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {q.data.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap px-4 py-2 text-gray-500">
                {new Date(a.createdAt).toLocaleString(i18n.language)}
              </td>
              <td className="px-4 py-2 font-mono text-xs">{a.action}</td>
              <td className="px-4 py-2">{a.actor?.email ?? '—'}</td>
              <td className="px-4 py-2 font-mono text-xs text-gray-500">
                {a.businessId?.slice(0, 8) ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
