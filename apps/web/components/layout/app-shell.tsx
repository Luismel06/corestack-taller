'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell, Building2, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  clearSession,
  getSession,
  subscribeSession,
  updateSessionAccess,
  type AuthSession,
} from '@/lib/auth-session';
import { canAccessPath, getDefaultPathForSession } from '@/lib/authorization';
import {
  getCurrentCashSession,
  getCurrentAccess,
  ApiError,
  getOperationalDashboardSummary,
  getFiscalSequenceAlerts,
  type FiscalSequenceAlert,
} from '@/lib/api';
import { brand } from '@/lib/brand';
import { translateRole } from '@/lib/display-labels';
import { cn, formatCurrency } from '@/lib/utils';
import { GlobalSearch } from './global-search';
import { MobileNavigation, Sidebar } from './sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);
  const pathname = usePathname();
  const router = useRouter();
  const accessQuery = useQuery({
    queryKey: ['auth-access', session?.tenantId, session?.user.id, session?.expiresAt],
    queryFn: async () => {
      const current = getSession();
      if (!current) return null;
      const access = await getCurrentAccess(current.tenantId, current.accessToken);
      updateSessionAccess(access, current.accessToken, current.tenantId);
      return access;
    },
    enabled: Boolean(session),
    refetchInterval: 20_000,
    retry: false,
  });
  useEffect(() => subscribeSession(() => setSession(getSession())), []);
  useEffect(() => {
    if (accessQuery.error instanceof ApiError && [401, 403].includes(accessQuery.error.status)) {
      clearSession();
      router.replace('/login');
    }
  }, [accessQuery.error, router]);
  useEffect(() => {
    if (session && !canAccessPath(session, pathname))
      router.replace(getDefaultPathForSession(session));
  }, [session, pathname, router]);

  const summaryQuery = useQuery({
    queryKey: ['dashboard-operational-summary', session?.tenantId],
    queryFn: () =>
      getOperationalDashboardSummary(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session && canAccessPath(session, '/dashboard')),
    refetchInterval: 60_000,
  });
  const fiscalSequenceAlertsQuery = useQuery({
    queryKey: ['fiscal-sequence-alerts', session?.tenantId],
    queryFn: () => getFiscalSequenceAlerts(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
    refetchInterval: 60_000,
  });
  const currentCashSessionQuery = useQuery({
    queryKey: ['cash-session-current', session?.tenantId, 'logout-guard'],
    queryFn: () => getCurrentCashSession(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });

  useEffect(() => {
    const currentSession = getSession();
    setSession(currentSession);

    if (!currentSession) {
      const nextPath = `${pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    if (!canAccessPath(currentSession, pathname)) {
      router.replace(getDefaultPathForSession(currentSession));
    }
  }, [pathname, router]);

  useEffect(() => {
    const cashSessionOpen = currentCashSessionQuery.data?.status === 'OPEN';

    if (!session || !cashSessionOpen) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentCashSessionQuery.data?.status, session]);

  async function handleLogout() {
    if (!session) {
      clearSession();
      router.replace('/login');
      return;
    }

    try {
      const currentCashSession = await getCurrentCashSession(session.tenantId, session.accessToken);

      if (currentCashSession?.status === 'OPEN') {
        toast.warning('Debes cerrar la caja antes de salir.', {
          description: `${currentCashSession.cashRegister.name} sigue abierta con fondo inicial ${formatCurrency(Number(currentCashSession.openingAmount))}.`,
        });
        if (canAccessPath(session, '/pos')) {
          router.replace('/pos');
          return;
        }
        router.push(
          canAccessPath(session, '/cash/sessions')
            ? '/cash/sessions'
            : getDefaultPathForSession(session),
        );
        return;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No pude validar el estado de la caja.');
      return;
    }

    clearSession();
    toast.success('Sesion cerrada correctamente.');
    router.replace('/login');
  }

  if (session === undefined) {
    return (
      <div className="grid min-h-screen place-items-center bg-zinc-100 px-4">
        <div className="rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm text-muted-foreground shadow-sm">
          Validando sesion...
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="grid min-h-screen place-items-center bg-zinc-100 px-4">
        <div className="rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm text-muted-foreground shadow-sm">
          Redirigiendo al login...
        </div>
      </div>
    );
  }

  const orderTakingTablet = session.role === 'ORDER_TAKER' && pathname === '/workshop/agenda';
  const posWorkspace = pathname === '/pos';
  const invoicePrintWorkspace = /^\/invoices\/[^/]+\/print$/.test(pathname);
  const focusedWorkspace = invoicePrintWorkspace;

  return (
    <div
      className={cn(
        'min-h-screen bg-zinc-100 print:min-h-0 print:bg-white',
        orderTakingTablet && 'workshop-tablet-shell',
      )}
    >
      {!focusedWorkspace ? (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((current) => !current)}
        />
      ) : null}

      <div
        className={cn(
          'min-h-screen pb-24 transition-[padding] duration-200 print:min-h-0 lg:pb-0',
          focusedWorkspace && 'pb-0',
          focusedWorkspace ? 'lg:pl-0' : sidebarCollapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-72',
          'print:pb-0 print:pl-0',
        )}
      >
        <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur print:hidden">
          <div
            className={cn(
              'flex items-center justify-between gap-3 px-3 sm:px-6',
              posWorkspace ? 'h-12' : orderTakingTablet ? 'h-14' : 'h-16',
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {focusedWorkspace ? (
                  <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border bg-white">
                    <img src={brand.logoPath} alt="" className="h-full w-full object-contain p-1" />
                  </div>
                ) : (
                  <div className="hidden h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary sm:flex">
                    <Building2 className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{brand.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {orderTakingTablet
                      ? 'Taller'
                      : posWorkspace
                        ? 'Caja operativa'
                        : 'Operación del taller'}
                  </p>
                </div>
              </div>
            </div>

            {!orderTakingTablet ? <GlobalSearch session={session} /> : <div className="flex-1" />}

            <div className="relative flex shrink-0 items-center gap-2">
              {!orderTakingTablet ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Notificaciones"
                    className="relative inline-flex"
                    onClick={() => setNotificationsOpen((current) => !current)}
                  >
                    <Bell className="h-5 w-5" />
                    {fiscalSequenceAlertsQuery.data?.length ? (
                      <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                        {fiscalSequenceAlertsQuery.data.length > 9
                          ? '9+'
                          : fiscalSequenceAlertsQuery.data.length}
                      </span>
                    ) : null}
                  </Button>
                  {notificationsOpen ? (
                    <NotificationsPanel
                      pendingInvoices={summaryQuery.data?.pendingInvoices ?? 0}
                      lowStockProducts={summaryQuery.data?.lowStockProducts ?? 0}
                      openCashSessions={summaryQuery.data?.openCashSessions ?? 0}
                      fiscalSequenceAlerts={fiscalSequenceAlertsQuery.data ?? []}
                      loading={summaryQuery.isLoading || fiscalSequenceAlertsQuery.isLoading}
                      onClose={() => setNotificationsOpen(false)}
                    />
                  ) : null}
                </>
              ) : null}
              <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1.5 sm:px-3">
                <div className="h-8 w-8 rounded-md bg-primary text-center text-sm font-semibold leading-8 text-primary-foreground">
                  {session?.user.name.slice(0, 2).toUpperCase() ?? 'RV'}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium">{session?.user.name ?? brand.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {translateRole(session?.role) ?? 'Operacion'}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label="Cerrar sesion"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>
        <main
          className={cn(
            'animate-page-enter mx-auto w-full max-w-[92rem] px-3 py-4 print:max-w-none print:p-0 sm:px-6 sm:py-6',
            focusedWorkspace && 'max-w-none sm:px-4 sm:py-4 lg:px-5 lg:py-4',
            posWorkspace &&
              'px-3 py-2 sm:px-4 sm:py-2 md:h-[calc(100dvh-3rem)] md:overflow-hidden lg:px-4 lg:py-2',
          )}
        >
          {children}
        </main>
      </div>

      {!focusedWorkspace ? <MobileNavigation /> : null}
    </div>
  );
}

function NotificationsPanel({
  pendingInvoices,
  lowStockProducts,
  openCashSessions,
  fiscalSequenceAlerts,
  loading,
  onClose,
}: {
  pendingInvoices: number;
  lowStockProducts: number;
  openCashSessions: number;
  fiscalSequenceAlerts: FiscalSequenceAlert[];
  loading: boolean;
  onClose: () => void;
}) {
  const notifications = [
    {
      id: 'pending-invoices',
      label: 'Facturas pendientes',
      value: pendingInvoices,
      href: '/invoices',
      detail: undefined,
      critical: false,
    },
    {
      id: 'low-stock-products',
      label: 'Productos bajo stock',
      value: lowStockProducts,
      href: '/products',
      detail: undefined,
      critical: false,
    },
    {
      id: 'open-cash-sessions',
      label: 'Cajas abiertas',
      value: openCashSessions,
      href: '/cash/sessions',
      detail: undefined,
      critical: false,
    },
    ...fiscalSequenceAlerts.map((alert) => ({
      id: alert.id,
      label: getFiscalSequenceAlertLabel(alert),
      value:
        alert.missing || alert.exhausted || alert.expired
          ? 'Revisar'
          : `${alert.remaining} restantes`,
      href: '/settings/fiscal-sequences',
      detail:
        alert.missing || alert.exhausted || alert.expired
          ? 'Requiere un bloque autorizado por DGII.'
          : undefined,
      critical: alert.severity === 'critical',
    })),
  ];

  return (
    <div className="absolute right-12 top-12 z-50 w-80 rounded-md border border-zinc-200 bg-white p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">Notificaciones</p>
        <button type="button" className="text-xs text-muted-foreground" onClick={onClose}>
          Cerrar
        </button>
      </div>
      {loading ? (
        <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-muted-foreground">
          Cargando alertas...
        </p>
      ) : (
        <div className="space-y-2">
          {notifications.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              onClick={onClose}
              className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm transition hover:border-zinc-300 hover:bg-zinc-50"
            >
              <span className="min-w-0">
                <span className="block truncate">{item.label}</span>
                {item.detail ? (
                  <span className="block text-xs text-muted-foreground">{item.detail}</span>
                ) : null}
              </span>
              <span
                className={cn(
                  'ml-3 shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold',
                  item.critical
                    ? 'bg-danger/10 text-danger'
                    : item.value
                      ? 'bg-primary/10 text-primary'
                      : 'bg-zinc-100 text-zinc-500',
                )}
              >
                {item.value}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function getFiscalSequenceAlertLabel(alert: FiscalSequenceAlert) {
  if (alert.missing) return `${alert.prefix}: falta bloque autorizado`;
  if (alert.expired) return `${alert.prefix}: vigencia fiscal vencida`;
  if (alert.exhausted) return `${alert.prefix}: bloque agotado`;
  return `${alert.prefix}: próximo a agotarse`;
}
