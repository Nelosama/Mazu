import { NavLink, Navigate, Outlet, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/AuthContext';
import { useBusiness } from '@/hooks/useBusiness';
import { useBrandTheme } from '@/hooks/useBrandTheme';
import { cn } from '@/lib/cn';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Alert, PageLoader } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  manageOnly?: boolean;
}

export function AppLayout() {
  const { t } = useTranslation();
  const { businessId = '' } = useParams();
  const { me, logout } = useAuth();
  const { membership, canManage, business, isLoading } = useBusiness();
  useBrandTheme(business?.primaryColor);

  if (!membership) return <Navigate to="/app" replace />;
  if (isLoading) return <PageLoader label={t('common.loading')} />;

  const base = `/app/${businessId}`;
  const allItems: NavItem[] = [
    { to: `${base}/agenda`, label: t('nav.agenda'), icon: 'calendar' },
    { to: `${base}/services`, label: t('nav.services'), icon: 'scissors', manageOnly: true },
    { to: `${base}/staff`, label: t('nav.staff'), icon: 'users' },
    { to: `${base}/feedback`, label: t('nav.feedback'), icon: 'star', manageOnly: true },
    { to: `${base}/settings`, label: t('nav.settings'), icon: 'cog', manageOnly: true },
  ];
  const items = allItems.filter((i) => canManage || !i.manageOnly);

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-gray-200 bg-white lg:flex">
        <div className="border-b border-gray-100 p-5">
          <p className="truncate font-bold text-gray-900">{membership.business.name}</p>
          <a
            href={`/b/${membership.business.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-brand-ink hover:underline"
          >
            {t('nav.viewPublic')} ↗
          </a>
        </div>
        <nav className="flex-1 space-y-1 p-3" aria-label={t('nav.main')}>
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                  isActive ? 'bg-brand-soft text-brand-ink' : 'text-gray-700 hover:bg-gray-100',
                )
              }
            >
              <Icon name={i.icon} className="h-5 w-5" />
              {i.label}
            </NavLink>
          ))}
          {canManage && (
            <NavLink
              to={`${base}/team`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                  isActive ? 'bg-brand-soft text-brand-ink' : 'text-gray-700 hover:bg-gray-100',
                )
              }
            >
              <Icon name="key" className="h-5 w-5" />
              {t('nav.team')}
            </NavLink>
          )}
        </nav>
        <div className="space-y-3 border-t border-gray-100 p-4">
          {me && me.memberships.length > 1 && (
            <NavLink to="/app" className="block text-sm text-gray-600 hover:text-gray-900">
              {t('nav.switchBusiness')}
            </NavLink>
          )}
          {me?.isPlatformAdmin && (
            <NavLink to="/admin" className="block text-sm text-gray-600 hover:text-gray-900">
              {t('nav.superAdmin')}
            </NavLink>
          )}
          <LanguageSwitcher />
          <div className="flex items-center justify-between text-sm">
            <span className="truncate text-gray-500">{me?.user.name}</span>
            <button
              type="button"
              onClick={() => void logout()}
              className="font-medium text-gray-700 hover:text-gray-900"
            >
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <p className="truncate font-bold text-gray-900">{membership.business.name}</p>
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            <details className="relative">
              <summary
                className="list-none rounded-full p-2 text-gray-600 hover:bg-gray-100"
                aria-label={t('nav.more')}
              >
                <Icon name="menu" className="h-5 w-5" />
              </summary>
              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-gray-200">
                {canManage && (
                  <NavLink
                    to={`${base}/team`}
                    className="block rounded-lg px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    {t('nav.team')}
                  </NavLink>
                )}
                <a
                  href={`/b/${membership.business.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg px-3 py-2 text-sm hover:bg-gray-50"
                >
                  {t('nav.viewPublic')}
                </a>
                {me && me.memberships.length > 1 && (
                  <NavLink
                    to="/app"
                    className="block rounded-lg px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    {t('nav.switchBusiness')}
                  </NavLink>
                )}
                {me?.isPlatformAdmin && (
                  <NavLink
                    to="/admin"
                    className="block rounded-lg px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    {t('nav.superAdmin')}
                  </NavLink>
                )}
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-gray-50"
                >
                  {t('nav.logout')}
                </button>
              </div>
            </details>
          </div>
        </header>

        {business?.status === 'SUSPENDED' && (
          <div className="p-4">
            <Alert tone="amber">{t('app.suspended')}</Alert>
          </div>
        )}

        <main className="flex-1 px-4 py-5 pb-24 lg:px-8 lg:py-8 lg:pb-8">
          <Outlet />
        </main>

        <nav
          className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-gray-200 bg-white lg:hidden"
          aria-label={t('nav.main')}
        >
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                  isActive ? 'text-brand-ink' : 'text-gray-500',
                )
              }
            >
              <Icon name={i.icon} className="h-6 w-6" />
              {i.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
