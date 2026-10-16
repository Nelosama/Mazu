import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api';
import type { BusinessDetail, Role } from '@/services/types';
import { useBusiness } from '@/hooks/useBusiness';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useAuth } from '@/features/auth/AuthContext';
import { buildTheme, contrastRatio, parseHex } from '@/lib/theme';
import { formatMoney } from '@/lib/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  PageHeader,
  PageLoader,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { BusinessFields, type RegionalValues } from '@/features/catalog/BusinessFields';
import { ImageUpload } from '@/features/catalog/ImageUpload';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { businessId, business, role } = useBusiness();
  if (!business) return <PageLoader label={t('common.loading')} />;
  return (
    <SettingsContent key={business.id} businessId={businessId} business={business} role={role} />
  );
}

function SettingsContent({
  businessId,
  business,
  role,
}: {
  businessId: string;
  business: BusinessDetail;
  role: Role | null;
}) {
  const { t, i18n } = useTranslation();
  const { reload } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [form, setForm] = useState<Partial<BusinessDetail>>(business);

  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api<BusinessDetail>(`/businesses/${businessId}`, { method: 'PATCH', body: patch }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['business', businessId] });
      void reload();
      toast(t('common.saved'));
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const plan = business.subscription?.plan;
  const publicUrl = `${window.location.origin}/b/${business.slug}`;
  const shareUrl = `${window.location.origin}/share/b/${business.slug}`;
  const color = form.primaryColor ?? business.primaryColor;
  const theme = buildTheme(color);
  const rgb = parseHex(color);
  const regional: RegionalValues = {
    type: form.type ?? business.type,
    country: form.country ?? business.country,
    currency: form.currency ?? business.currency,
    timezone: form.timezone ?? business.timezone,
    locale: form.locale ?? business.locale,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={t('settings.title')} />

      <Section title={t('settings.publicLink')} description={t('settings.publicLinkHint')}>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-50 px-3 py-2 text-sm">
            {publicUrl}
          </code>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void navigator.clipboard?.writeText(publicUrl).then(() => toast(t('common.copied')))
            }
          >
            {t('common.copyLink')}
          </Button>
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-brand-ink"
          >
            {t('settings.open')} ↗
          </a>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {t('settings.shareHint')} <code>{shareUrl}</code>
        </p>
      </Section>

      <Section title={t('settings.profile')}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              name: form.name,
              description: form.description ?? '',
              slug: form.slug,
              ...regional,
            });
          }}
        >
          <Input
            label={t('settings.name')}
            value={form.name ?? ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={80}
          />
          <Textarea
            label={t('settings.description')}
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={1000}
          />
          <Input
            label={t('settings.slug')}
            hint={t('settings.slugHint')}
            value={form.slug ?? ''}
            pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
            onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
          />
          <BusinessFields
            value={regional}
            onChange={(v) => setForm({ ...form, ...v } as Partial<BusinessDetail>)}
          />
          <Button type="submit" loading={save.isPending}>
            {t('common.save')}
          </Button>
        </form>
      </Section>

      <Section title={t('settings.images')}>
        <div className="space-y-4">
          <ImageUpload
            businessId={businessId}
            kind="logo"
            currentUrl={business.logoUrl}
            label={t('settings.logo')}
            onUploaded={() => void qc.invalidateQueries({ queryKey: ['business', businessId] })}
          />
          <ImageUpload
            businessId={businessId}
            kind="cover"
            currentUrl={business.coverUrl}
            shape="wide"
            label={t('settings.cover')}
            onUploaded={() => void qc.invalidateQueries({ queryKey: ['business', businessId] })}
          />
          <Portfolio businessId={businessId} />
        </div>
      </Section>

      <Section title={t('settings.branding')} description={t('settings.brandingHint')}>
        {!plan?.customBranding && (
          <div className="mb-3">
            <Alert tone="amber">{t('settings.brandingLocked')}</Alert>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <input
            type="color"
            aria-label={t('settings.color')}
            value={color}
            disabled={!plan?.customBranding}
            onChange={(e) => setForm({ ...form, primaryColor: e.target.value.toUpperCase() })}
            className="h-12 w-16 cursor-pointer rounded-lg border-0 bg-transparent disabled:opacity-50"
          />
          <div className="flex items-center gap-2">
            <span
              className="rounded-xl px-4 py-2.5 text-sm font-semibold"
              style={{ background: theme.solid, color: theme.onBrand }}
            >
              {t('public.bookNow')}
            </span>
            <span className="text-sm font-semibold" style={{ color: theme.ink }}>
              {t('settings.linkSample')}
            </span>
          </div>
          {rgb && (
            <Badge tone={contrastRatio(rgb, [255, 255, 255]) >= 4.5 ? 'green' : 'amber'}>
              {t('settings.contrastAuto')}
            </Badge>
          )}
          <Button
            size="sm"
            disabled={!plan?.customBranding}
            loading={save.isPending}
            onClick={() => save.mutate({ primaryColor: color })}
          >
            {t('common.save')}
          </Button>
        </div>
      </Section>

      <Section title={t('settings.rules')}>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              slotIntervalMinutes: Number(form.slotIntervalMinutes),
              minLeadMinutes: Number(form.minLeadMinutes),
              maxAdvanceDays: Number(form.maxAdvanceDays),
              cancelWindowMinutes: Number(form.cancelWindowMinutes),
              feedbackEnabled: form.feedbackEnabled,
            });
          }}
        >
          <Select
            label={t('settings.slotInterval')}
            value={form.slotIntervalMinutes ?? 15}
            onChange={(e) => setForm({ ...form, slotIntervalMinutes: Number(e.target.value) })}
          >
            {[5, 10, 15, 20, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </Select>
          <Input
            label={t('settings.minLead')}
            type="number"
            min={0}
            max={10080}
            value={form.minLeadMinutes ?? 0}
            onChange={(e) => setForm({ ...form, minLeadMinutes: Number(e.target.value) })}
            hint={t('settings.minutes')}
          />
          <Input
            label={t('settings.maxAdvance')}
            type="number"
            min={1}
            max={365}
            value={form.maxAdvanceDays ?? 60}
            onChange={(e) => setForm({ ...form, maxAdvanceDays: Number(e.target.value) })}
            hint={t('settings.days')}
          />
          <Input
            label={t('settings.cancelWindow')}
            type="number"
            min={0}
            max={10080}
            value={form.cancelWindowMinutes ?? 0}
            onChange={(e) => setForm({ ...form, cancelWindowMinutes: Number(e.target.value) })}
            hint={t('settings.minutes')}
          />
          <div className="sm:col-span-2">
            <Checkbox
              label={t('settings.feedbackEnabled')}
              checked={form.feedbackEnabled ?? true}
              onChange={(e) => setForm({ ...form, feedbackEnabled: e.target.checked })}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Section>

      <Section title={t('settings.plan')}>
        {plan ? (
          <div className="text-sm">
            <p className="font-semibold text-gray-900">
              {plan.name} <Badge tone="brand">{business.subscription?.status}</Badge>
            </p>
            <ul className="mt-2 space-y-1 text-gray-600">
              <li>
                {plan.maxStaff === null
                  ? t('settings.planStaffUnlimited')
                  : t('settings.planStaff', { count: plan.maxStaff })}
              </li>
              <li>
                {plan.maxMonthlyBookings === null
                  ? t('settings.planBookingsUnlimited')
                  : t('settings.planBookings', { count: plan.maxMonthlyBookings })}
              </li>
              <li>
                {t('settings.planPrice', {
                  price: formatMoney(plan.monthlyPrice, plan.currency, i18n.language),
                })}
              </li>
            </ul>
            <p className="mt-2 text-xs text-gray-500">{t('settings.noBilling')}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">—</p>
        )}
      </Section>

      <Branches businessId={businessId} />
      {role === 'OWNER' && <SupportAccess businessId={businessId} />}
    </div>
  );
}

function Portfolio({ businessId }: { businessId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['portfolio', businessId],
    queryFn: () =>
      api<{ id: string; url: string; caption: string | null }[]>(
        `/businesses/${businessId}/media/portfolio`,
      ),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/businesses/${businessId}/media/portfolio/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['portfolio', businessId] }),
  });
  return (
    <div>
      <ImageUpload
        businessId={businessId}
        kind="portfolio"
        label={t('media.addPortfolio')}
        onUploaded={() => void qc.invalidateQueries({ queryKey: ['portfolio', businessId] })}
      />
      {(q.data ?? []).length > 0 && (
        <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {q.data!.map((p) => (
            <li
              key={p.id}
              className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100"
            >
              <img src={p.url} alt={p.caption ?? ''} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => remove.mutate(p.id)}
                className="absolute right-1 top-1 rounded-full bg-white/90 px-2 text-xs font-semibold text-red-600 shadow"
                aria-label={t('common.delete')}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Branches({ businessId }: { businessId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const q = useQuery({
    queryKey: ['branches', businessId],
    queryFn: () =>
      api<{ id: string; name: string; address: string | null; timezone: string; status: string }[]>(
        `/businesses/${businessId}/branches`,
      ),
  });
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const add = useMutation({
    mutationFn: () =>
      api(`/businesses/${businessId}/branches`, { body: { name, address: address || undefined } }),
    onSuccess: () => {
      setName('');
      setAddress('');
      void qc.invalidateQueries({ queryKey: ['branches', businessId] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const update = useMutation({
    mutationFn: (b: { id: string; address: string }) =>
      api(`/businesses/${businessId}/branches/${b.id}`, {
        method: 'PATCH',
        body: { address: b.address },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['branches', businessId] });
      toast(t('common.saved'));
    },
  });
  return (
    <Section title={t('settings.branches')} description={t('settings.branchesHint')}>
      <ul className="divide-y divide-gray-100 text-sm">
        {(q.data ?? []).map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="w-32 font-medium">{b.name}</span>
            <input
              defaultValue={b.address ?? ''}
              aria-label={t('settings.address')}
              placeholder={t('settings.address')}
              onBlur={(e) =>
                e.target.value !== (b.address ?? '') &&
                update.mutate({ id: b.id, address: e.target.value })
              }
              className="min-w-0 flex-1 rounded-lg border-0 py-1.5 text-sm ring-1 ring-gray-200"
            />
            <span className="text-xs text-gray-500">{b.timezone}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Input
          label={t('settings.branchName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label={t('settings.address')}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <Button
          variant="secondary"
          disabled={name.length < 2}
          loading={add.isPending}
          onClick={() => add.mutate()}
        >
          {t('common.add')}
        </Button>
      </div>
    </Section>
  );
}

function SupportAccess({ businessId }: { businessId: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['support', businessId],
    queryFn: () =>
      api<{ id: string; reason: string; expiresAt: string; revokedAt: string | null }[]>(
        `/businesses/${businessId}/support-grants`,
      ),
  });
  const [reason, setReason] = useState('');
  const grant = useMutation({
    mutationFn: () =>
      api(`/businesses/${businessId}/support-grants`, { body: { reason, hours: 24 } }),
    onSuccess: () => {
      setReason('');
      void qc.invalidateQueries({ queryKey: ['support', businessId] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(`/businesses/${businessId}/support-grants/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['support', businessId] }),
  });
  const active = (q.data ?? []).filter((g) => !g.revokedAt && new Date(g.expiresAt) > new Date());
  return (
    <Section title={t('settings.support')} description={t('settings.supportHint')}>
      {active.map((g) => (
        <div
          key={g.id}
          className="mb-2 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm"
        >
          <span>
            {g.reason} ·{' '}
            {t('settings.until', { date: new Date(g.expiresAt).toLocaleString(i18n.language) })}
          </span>
          <button
            type="button"
            className="font-semibold text-red-600"
            onClick={() => revoke.mutate(g.id)}
          >
            {t('settings.revoke')}
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <Input
          wrapperClassName="flex-1"
          label={t('settings.supportReason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
        <Button
          variant="secondary"
          disabled={reason.length < 5}
          loading={grant.isPending}
          onClick={() => grant.mutate()}
        >
          {t('settings.grant24')}
        </Button>
      </div>
    </Section>
  );
}
