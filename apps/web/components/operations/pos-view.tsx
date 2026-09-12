'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CalendarClock,
  ClipboardCheck,
  DoorClosed,
  DoorOpen,
  Filter,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Wrench,
  X,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  closeCashSession,
  completePosSale,
  claimSalesOrder,
  getCashRegisters,
  getCashSessions,
  getCurrentCashSession,
  getCustomers,
  getPosProductByBarcode,
  getSalesOrders,
  getSalesOrder,
  openCashSession,
  releaseSalesOrder,
  searchPosProducts,
  type Product,
  type CashSession,
  type SalesOrder,
} from '@/lib/api';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import { hasPermission, isAdminSession } from '@/lib/authorization';
import { getOrderClientLabel, getOrderSearchLabel } from '@/lib/order-client';
import { translateStatus } from '@/lib/display-labels';
import { normalizeDominicanDocument, validateDominicanDocument } from '@/lib/dominican-documents';
import { BarcodeInput } from './pos/barcode-input';
import {
  clearCurrencyInput,
  formatCurrencyInput,
  formatCurrencyInputFromNumber,
  parseCurrencyInput,
  sanitizeCurrencyInput,
} from './pos/currency-input';
import { PosCart } from './pos/pos-cart';
import { PosPaymentPanel } from './pos/pos-payment-panel';
import { PosProductGrid } from './pos/pos-product-grid';
import {
  canAddProduct,
  getAvailableStock,
  getDefaultQuantity,
  getProductPrice,
  getQuantityStep,
  roundQuantity,
  uniqueValues,
} from './pos/pos-utils';
import { playScanFeedback } from './pos/scan-feedback';
import type { CartItem } from './pos/types';
import { splitPaymentSummary, type SplitPaymentRow } from './pos/split-payments';
import { SessionRequired, useCurrentSession } from './session-required';
import { ActionDialog } from '@/components/ui/action-dialog';

type BarcodeDetectorResult = { rawValue: string };
type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]>;
};
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
type WindowWithBarcodeDetector = Window &
  typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor };

export function PosView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedOrderId = searchParams.get('order');
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);
  const checkoutKeyRef = useRef<string | null>(null);
  const knownReadyOrdersRef = useRef<{ cashSessionId: string; ids: Set<string> } | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [documentType, setDocumentType] = useState('CONSUMER_02');
  const [fiscalDocumentType, setFiscalDocumentType] = useState<'RNC' | 'CEDULA'>('RNC');
  const [fiscalDocumentNumber, setFiscalDocumentNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [splitPayments, setSplitPayments] = useState<SplitPaymentRow[]>([]);
  const [directElectronic, setDirectElectronic] = useState(false);
  const [directRecipientEmail, setDirectRecipientEmail] = useState('');
  const [amountReceived, setAmountReceived] = useState(clearCurrencyInput());
  const [barcode, setBarcode] = useState('');
  const [scannerEnabled, setScannerEnabled] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scannerMessage, setScannerMessage] = useState<string | null>(null);
  const [lastScannedProduct, setLastScannedProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [brandFilter, setBrandFilter] = useState('ALL');
  const [selectedRegisterId, setSelectedRegisterId] = useState('');
  const [openingAmount, setOpeningAmount] = useState(clearCurrencyInput());
  const [closingAmount, setClosingAmount] = useState(clearCurrencyInput());
  const [cart, setCart] = useState<CartItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loadedOrder, setLoadedOrder] = useState<SalesOrder | null>(null);
  const [closingDialogOpen, setClosingDialogOpen] = useState(false);
  const [counterSaleOpen, setCounterSaleOpen] = useState(false);

  const customersQuery = useQuery({
    queryKey: ['pos-customers', session?.tenantId],
    queryFn: () => getCustomers(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });
  const registersQuery = useQuery({
    queryKey: ['cash-registers', session?.tenantId],
    queryFn: () => getCashRegisters(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });
  const currentSessionQuery = useQuery({
    queryKey: ['cash-session-current', session?.tenantId],
    queryFn: () => getCurrentCashSession(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });
  const cashSessionsQuery = useQuery({
    queryKey: ['cash-sessions', session?.tenantId, 'pos'],
    queryFn: () => getCashSessions(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session && isAdminSession(session)),
  });
  const canCreateDirectSale = Boolean(
    session && !isAdminSession(session) && hasPermission(session, 'pos.sell'),
  );
  const isAdmin = isAdminSession(session);
  const productsQuery = useQuery({
    queryKey: ['pos-products-search', session?.tenantId, search],
    queryFn: () => searchPosProducts(session?.tenantId ?? '', session?.accessToken ?? '', search),
    enabled: Boolean(session && currentSessionQuery.data && canCreateDirectSale && !loadedOrder),
  });
  const pendingOrdersQuery = useQuery({
    queryKey: ['sales-orders', session?.tenantId, 'OPEN', 'pos'],
    queryFn: () => getSalesOrders(session?.tenantId ?? '', session?.accessToken ?? '', 'OPEN'),
    enabled: Boolean(session && currentSessionQuery.data),
    refetchInterval: 20_000,
  });
  const requestedOrderQuery = useQuery({
    queryKey: ['sales-orders', session?.tenantId, 'requested', requestedOrderId],
    queryFn: () => getSalesOrder(session!.tenantId, session!.accessToken, requestedOrderId!),
    enabled: Boolean(session && requestedOrderId),
    retry: false,
  });

  const currentCashSession = currentSessionQuery.data;
  const canUsePos = Boolean(session && (isAdmin || hasPermission(session, 'pos.sell')));
  const canOpenCashSession =
    Boolean(session?.permissions.canOpenCashSession) && !isAdminSession(session);
  const canCloseCashSession =
    session?.permissions.canCloseCashSession ??
    ['ADMIN', 'SUPER_ADMIN', 'QORVEX_SUPER_ADMIN'].includes(session?.role ?? '');
  const cartReadOnly = Boolean(loadedOrder);
  const readyOrders = (pendingOrdersQuery.data ?? []).filter((order) =>
    ['SENT_TO_CASHIER', 'IN_CASHIER'].includes(order.status),
  );
  const electronicInvoiceRequested = loadedOrder
    ? loadedOrder.electronicInvoiceRequested
    : directElectronic;
  const todayLabel = new Intl.DateTimeFormat('es-DO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  useEffect(() => {
    if (!currentCashSession || pendingOrdersQuery.isLoading) {
      knownReadyOrdersRef.current = null;
      return;
    }

    const ids = new Set(readyOrders.map((order) => order.id));
    const previous = knownReadyOrdersRef.current;
    if (previous?.cashSessionId === currentCashSession.id) {
      const arrivals = readyOrders.filter(
        (order) => order.status === 'SENT_TO_CASHIER' && !previous.ids.has(order.id),
      );
      if (arrivals.length === 1) {
        toast.info('Nueva orden lista para cobrar', {
          description: `${arrivals[0].workshopTicket?.ticketNumber ?? arrivals[0].orderNumber} ya está disponible en Caja.`,
          duration: 7000,
        });
      } else if (arrivals.length > 1) {
        toast.info(`${arrivals.length} nuevas órdenes listas para cobrar`, {
          description: 'Ya están disponibles en la cola de Caja.',
          duration: 7000,
        });
      }
    }
    knownReadyOrdersRef.current = { cashSessionId: currentCashSession.id, ids };
  }, [currentCashSession?.id, pendingOrdersQuery.data, pendingOrdersQuery.isLoading]);

  useEffect(() => {
    const firstRegister = registersQuery.data?.find((register) => register.status === 'ACTIVE');
    if (!selectedRegisterId && firstRegister) {
      setSelectedRegisterId(firstRegister.id);
    }
  }, [registersQuery.data, selectedRegisterId]);

  useEffect(() => {
    if (currentCashSession && canCreateDirectSale) {
      setScannerEnabled(true);
      window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
    }
  }, [canCreateDirectSale, currentCashSession?.id]);

  useEffect(() => {
    if (scannerEnabled) {
      barcodeInputRef.current?.focus();
    }
  }, [scannerEnabled]);

  const totals = useMemo(() => {
    const subtotal =
      cart.reduce(
        (sum, item) =>
          sum + Math.round((item.subtotal ?? getProductPrice(item.product) * item.quantity) * 100),
        0,
      ) / 100;
    const tax =
      cart.reduce(
        (sum, item) =>
          sum +
          Math.round(
            (item.taxTotal ??
              (Math.round(getProductPrice(item.product) * item.quantity * 100) / 100) *
                Number(item.product.taxRate)) * 100,
          ),
        0,
      ) / 100;
    const discount = cart.reduce((sum, item) => sum + (item.discountTotal ?? 0), 0);
    const total = Math.round((subtotal + tax) * 100) / 100;
    const received = parseCurrencyInput(amountReceived);
    const requiredPayment =
      loadedOrder?.paymentMode === 'CREDIT' ? Number(loadedOrder.initialPaymentAmount ?? 0) : total;

    return {
      subtotal,
      discount,
      tax,
      total,
      requiredPayment,
      remainingBalance: Math.max(total - requiredPayment, 0),
      received:
        paymentMethod === 'MIXED'
          ? splitPaymentSummary(splitPayments, requiredPayment).applied +
            splitPaymentSummary(splitPayments, requiredPayment).change
          : received,
      change:
        paymentMethod === 'MIXED'
          ? splitPaymentSummary(splitPayments, requiredPayment).change
          : paymentMethod === 'CASH' && received > requiredPayment
            ? received - requiredPayment
            : 0,
    };
  }, [amountReceived, cart, loadedOrder, paymentMethod, splitPayments]);

  useEffect(() => {
    if (paymentMethod !== 'CASH' && paymentMethod !== 'MIXED' && totals.requiredPayment >= 0) {
      setAmountReceived(formatCurrencyInputFromNumber(totals.requiredPayment));
    }
  }, [paymentMethod, totals.requiredPayment]);

  useEffect(() => () => stopCameraScan(), []);

  const activeCustomers = (customersQuery.data ?? []).filter(
    (customer) => customer.status === 'ACTIVE',
  );
  const productPool = productsQuery.data ?? [];
  const categories = uniqueValues(
    productPool
      .map((product) => product.category?.name)
      .filter((value): value is string => Boolean(value)),
  );
  const brands = uniqueValues(
    productPool.map((product) => product.brand).filter((value): value is string => Boolean(value)),
  );
  const filteredProducts = productPool
    .filter((product) => categoryFilter === 'ALL' || product.category?.name === categoryFilter)
    .filter((product) => brandFilter === 'ALL' || product.brand === brandFilter);
  const quantitiesByProduct = Object.fromEntries(
    cart.map((item) => [item.product.id, item.quantity]),
  );
  const fiscalDocumentValid = validateDominicanDocument(fiscalDocumentType, fiscalDocumentNumber);
  const fiscalCustomer = fiscalDocumentValid
    ? activeCustomers.find(
        (customer) =>
          customer.documentType === fiscalDocumentType &&
          normalizeDominicanDocument(customer.documentNumber ?? '') ===
            normalizeDominicanDocument(fiscalDocumentNumber),
      )
    : undefined;
  const fiscalCustomerMatchesOrder =
    !loadedOrder?.customerId || fiscalCustomer?.id === loadedOrder.customerId;
  const requiresFiscalDocument = ['FISCAL_CREDIT_01', 'FISCAL_CREDIT_ELECTRONIC_31'].includes(
    documentType,
  );
  const requiresRnc = documentType === 'FISCAL_CREDIT_ELECTRONIC_31';
  const requiresE32Recipient = documentType === 'CONSUMER_ELECTRONIC_32' && totals.total >= 250000;
  const requiresRecipientDocument = requiresFiscalDocument || requiresE32Recipient;
  const canCompleteFiscalDocument =
    !requiresRecipientDocument ||
    Boolean(
      fiscalDocumentValid &&
      fiscalCustomer &&
      fiscalCustomerMatchesOrder &&
      (!requiresRnc || fiscalDocumentType === 'RNC'),
    );
  const canCompleteSale =
    !isAdmin &&
    cart.length > 0 &&
    Boolean(currentCashSession) &&
    (Boolean(loadedOrder) || canCreateDirectSale) &&
    (paymentMethod !== 'MIXED' ||
      splitPaymentSummary(splitPayments, totals.requiredPayment).valid) &&
    (!directElectronic ||
      Boolean(loadedOrder) ||
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(directRecipientEmail.trim())) &&
    canCompleteFiscalDocument;
  const selectedOpenSession = (cashSessionsQuery.data ?? []).find(
    (cashSession) =>
      cashSession.status === 'OPEN' && cashSession.cashRegister.id === selectedRegisterId,
  );
  const selectedRegisterOccupied =
    Boolean(selectedOpenSession) && selectedOpenSession?.openedBy?.id !== session?.user.id;

  function handleLoadOrder(order: SalesOrder) {
    if (completeSaleMutation.isPending || claimOrderMutation.isPending) return;
    if (!loadedOrder && cart.length) {
      toast.info('Completa o vacía la venta de mostrador antes de cargar una orden.');
      return;
    }
    if (loadedOrder && loadedOrder.id !== order.id) {
      setMessage('Quita la orden cargada o completala antes de seleccionar otro ticket.');
      toast.info('Primero quita la orden actual para elegir otra.');
      return;
    }

    setCounterSaleOpen(false);
    claimOrderMutation.mutate(order);
  }

  function releaseLoadedOrder() {
    if (!loadedOrder || releaseOrderMutation.isPending || completeSaleMutation.isPending) {
      return;
    }

    releaseOrderMutation.mutate(loadedOrder.id);
  }

  const openSessionMutation = useMutation({
    mutationFn: () => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }

      const parsedOpeningAmount = parseCurrencyInput(openingAmount);
      if (parsedOpeningAmount < 0) {
        throw new Error('El monto inicial no puede ser negativo.');
      }

      return openCashSession(session.tenantId, session.accessToken, {
        cashRegisterId: selectedRegisterId,
        openingAmount: parsedOpeningAmount,
      });
    },
    onSuccess: async () => {
      setMessage('Caja abierta correctamente.');
      toast.success('Caja abierta correctamente.');
      setAmountReceived(clearCurrencyInput());
      await invalidateCashQueries();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'No se pudo abrir la caja.';
      setMessage(message);
      toast.error(message);
    },
  });

  const closeSessionMutation = useMutation({
    mutationFn: () => {
      if (!session || !currentCashSession) {
        throw new Error('Sesion requerida.');
      }

      return closeCashSession(session.tenantId, session.accessToken, currentCashSession.id, {
        closingAmount: parseCurrencyInput(closingAmount),
        notes: 'Cierre desde caja',
      });
    },
    onSuccess: async () => {
      setMessage('Caja cerrada correctamente.');
      toast.success('Caja cerrada correctamente.');
      setClosingAmount(clearCurrencyInput());
      setClosingDialogOpen(false);
      setCart([]);
      setAmountReceived(clearCurrencyInput());
      await invalidateCashQueries();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'No se pudo cerrar la caja.';
      setMessage(message);
      toast.error(message);
    },
  });

  const barcodeMutation = useMutation({
    mutationFn: (code: string) => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }
      return getPosProductByBarcode(session.tenantId, session.accessToken, code);
    },
    onSuccess: (product) => {
      const added = addProduct(product);
      setBarcode('');
      if (added) {
        playScanFeedback('success');
        setLastScannedProduct(product);
        setScannerMessage(`Producto agregado: ${product.name}`);
        toast.success('Producto agregado', { description: product.name });
      } else {
        playScanFeedback('error');
      }
    },
    onError: () => {
      setBarcode('');
      playScanFeedback('error');
      setScannerMessage('Producto no encontrado.');
      toast.error('Producto no encontrado.');
    },
  });

  const completeSaleMutation = useMutation({
    mutationFn: () => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }

      return completePosSale(session.tenantId, session.accessToken, {
        checkoutKey: checkoutKeyRef.current ?? (checkoutKeyRef.current = crypto.randomUUID()),
        customerId: customerId || undefined,
        documentType,
        fiscalDocumentType: requiresRecipientDocument ? fiscalDocumentType : undefined,
        fiscalDocumentNumber: requiresRecipientDocument ? fiscalDocumentNumber : undefined,
        ...(paymentMethod === 'MIXED'
          ? {
              payments: splitPayments.map((row) => ({
                method: row.method,
                amount: parseCurrencyInput(row.amount),
                amountReceived:
                  row.method === 'CASH' ? parseCurrencyInput(row.amountReceived) : undefined,
                reference: row.reference.trim() || undefined,
              })),
            }
          : {
              paymentMethod,
              amountReceived: amountReceived ? parseCurrencyInput(amountReceived) : undefined,
            }),
        cashSessionId: currentCashSession?.id,
        orderId: loadedOrder?.id,
        electronicInvoiceRequested: loadedOrder ? undefined : directElectronic,
        ecfRecipientEmail:
          !loadedOrder && directElectronic ? directRecipientEmail.trim() : undefined,
        items: loadedOrder
          ? undefined
          : cart.map((item) => ({
              productId: item.product.id,
              quantity: item.quantity,
            })),
      });
    },
    onSuccess: async (invoice) => {
      setMessage(
        invoice.eNcf
          ? `e-CF ${invoice.eNcf} creada. Su XML y correo de simulación quedaron pendientes de firma y Resend.`
          : `Factura ${invoice.invoiceNumber} creada correctamente.`,
      );
      setCart([]);
      checkoutKeyRef.current = null;
      setPaymentMethod('CASH');
      setSplitPayments([]);
      setDirectElectronic(false);
      setDirectRecipientEmail('');
      setDocumentType('CONSUMER_02');
      setLoadedOrder(null);
      setFiscalDocumentNumber('');
      setAmountReceived(clearCurrencyInput());
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      await queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      await queryClient.invalidateQueries({ queryKey: ['pos-products-search'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      await queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      await queryClient.invalidateQueries({ queryKey: ['employee-logs'] });
      await invalidateCashQueries();
      toast.dismiss();
      router.push(`/invoices/${invoice.id}/print?autoPrint=1`);
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la venta.');
      toast.error(error instanceof Error ? error.message : 'No se pudo completar la venta.');
    },
  });

  const claimOrderMutation = useMutation({
    mutationFn: (order: SalesOrder) => {
      if (!session || !currentCashSession) {
        throw new Error('Debes abrir caja antes de tomar una orden.');
      }

      return claimSalesOrder(session.tenantId, session.accessToken, order.id, {
        cashSessionId: currentCashSession.id,
      });
    },
    onSuccess: async (order) => {
      loadClaimedSalesOrder(order);
      await queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      toast.success('Orden tomada en caja', { description: order.orderNumber });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo tomar la orden.');
    },
  });

  const releaseOrderMutation = useMutation({
    mutationFn: (orderId: string) => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }

      return releaseSalesOrder(session.tenantId, session.accessToken, orderId);
    },
    onSuccess: async (order) => {
      if (loadedOrder?.id === order.id) {
        setLoadedOrder(null);
        setCart([]);
        setCustomerId('');
        checkoutKeyRef.current = null;
        setPaymentMethod('CASH');
        setSplitPayments([]);
        setDirectElectronic(false);
        setDirectRecipientEmail('');
        setDocumentType('CONSUMER_02');
        setFiscalDocumentNumber('');
        setAmountReceived(clearCurrencyInput());
        setMessage(`Orden ${order.orderNumber} quitada. Ya puedes seleccionar otra.`);
      }
      await queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      toast.success('Orden liberada', { description: order.orderNumber });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo liberar la orden.');
    },
  });

  if (!session) {
    return <SessionRequired session={session} />;
  }

  async function invalidateCashQueries() {
    await queryClient.invalidateQueries({ queryKey: ['cash-session-current'] });
    await queryClient.invalidateQueries({ queryKey: ['cash-sessions'] });
    await queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  }

  function addProduct(product: Product) {
    if (!canCreateDirectSale || loadedOrder || completeSaleMutation.isPending) {
      setMessage('Libera la orden cargada antes de iniciar una venta de mostrador.');
      return false;
    }

    const currentQuantity = quantitiesByProduct[product.id] ?? 0;

    if (!canAddProduct(product, currentQuantity)) {
      setMessage(`No hay stock disponible para ${product.name}.`);
      return false;
    }

    setMessage(null);
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);

      if (existing) {
        return current.map((item) =>
          item.product.id === product.id
            ? {
                ...item,
                quantity: roundQuantity(
                  item.product.trackInventory
                    ? Math.min(
                        item.quantity + getQuantityStep(item.product),
                        getAvailableStock(item.product),
                      )
                    : item.quantity + getQuantityStep(item.product),
                ),
              }
            : item,
        );
      }

      return [...current, { product, quantity: getDefaultQuantity(product) }];
    });

    return true;
  }

  function updateQuantity(productId: string, quantity: number) {
    if (!canCreateDirectSale || loadedOrder || completeSaleMutation.isPending) {
      setMessage('El cajero no puede modificar una orden enviada a caja.');
      return;
    }

    setCart((current) =>
      current
        .map((item) => {
          if (item.product.id !== productId) {
            return item;
          }

          if (quantity <= 0) {
            return { ...item, quantity: 0 };
          }

          const availableStock = getAvailableStock(item.product);
          const quantityStep = getQuantityStep(item.product);
          const nextQuantity = item.product.trackInventory
            ? Math.min(Math.max(quantity, quantityStep), availableStock)
            : Math.max(quantity, quantityStep);

          return { ...item, quantity: roundQuantity(nextQuantity) };
        })
        .filter((item) => item.quantity > 0),
    );
  }

  function clearCart() {
    if (loadedOrder) {
      releaseOrderMutation.mutate(loadedOrder.id);
      return;
    }

    setCart([]);
    checkoutKeyRef.current = null;
    setPaymentMethod('CASH');
    setSplitPayments([]);
    setAmountReceived(clearCurrencyInput());
  }

  function requestCloseCashSession() {
    setClosingDialogOpen(true);
  }

  function changePaymentMethod(value: string) {
    setPaymentMethod(value);
    if (value === 'MIXED')
      setSplitPayments([
        { id: crypto.randomUUID(), method: 'CASH', amount: '', amountReceived: '', reference: '' },
        { id: crypto.randomUUID(), method: 'CARD', amount: '', amountReceived: '', reference: '' },
      ]);
    else setSplitPayments([]);
  }

  function populateFiscalDocumentFromCustomer(nextCustomerId: string) {
    const customer = activeCustomers.find((candidate) => candidate.id === nextCustomerId);
    if (
      customer &&
      (customer.documentType === 'RNC' || customer.documentType === 'CEDULA') &&
      customer.documentNumber
    ) {
      setFiscalDocumentType(customer.documentType);
      setFiscalDocumentNumber(customer.documentNumber);
    }
  }

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    if (['FISCAL_CREDIT_01', 'FISCAL_CREDIT_ELECTRONIC_31'].includes(documentType)) {
      populateFiscalDocumentFromCustomer(nextCustomerId);
    }
  }

  function handleDocumentTypeChange(nextDocumentType: string) {
    setDocumentType(nextDocumentType);
    if (
      ['FISCAL_CREDIT_01', 'FISCAL_CREDIT_ELECTRONIC_31'].includes(nextDocumentType) &&
      customerId
    ) {
      populateFiscalDocumentFromCustomer(customerId);
    }
    if (nextDocumentType === 'FISCAL_CREDIT_ELECTRONIC_31') {
      setFiscalDocumentType('RNC');
    }
  }

  function handleFiscalDocumentTypeChange(nextDocumentType: 'RNC' | 'CEDULA') {
    setFiscalDocumentType(nextDocumentType);
  }

  function handleFiscalDocumentNumberChange(nextDocumentNumber: string) {
    setFiscalDocumentNumber(nextDocumentNumber);
    const normalizedDocument = normalizeDominicanDocument(nextDocumentNumber);
    const matchingCustomer = activeCustomers.find(
      (customer) =>
        customer.documentType === fiscalDocumentType &&
        normalizeDominicanDocument(customer.documentNumber ?? '') === normalizedDocument,
    );

    if (
      matchingCustomer &&
      (!loadedOrder?.customerId || matchingCustomer.id === loadedOrder.customerId)
    ) {
      setCustomerId(matchingCustomer.id);
    }
  }

  function loadClaimedSalesOrder(order: SalesOrder) {
    const items: CartItem[] = [];
    for (const item of order.items) {
      if (!item.product) {
        continue;
      }

      items.push({
        product: item.product,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discountTotal: Number(item.discountTotal ?? 0),
        reservedQuantity: item.reservedQuantity,
        subtotal: Number(item.subtotal),
        taxTotal: Number(item.taxTotal),
        total: Number(item.total),
      });
    }

    if (items.length !== order.items.length) {
      toast.error('La orden tiene productos no disponibles. Revisa la orden antes de cobrar.');
      return;
    }

    setLoadedOrder(order);
    checkoutKeyRef.current = null;
    setDirectElectronic(false);
    setDirectRecipientEmail('');
    setPaymentMethod('CASH');
    setSplitPayments([]);
    setAmountReceived(clearCurrencyInput());
    setDocumentType(order.electronicInvoiceRequested ? 'CONSUMER_ELECTRONIC_32' : 'CONSUMER_02');
    setFiscalDocumentType('RNC');
    setCustomerId(order.customerId ?? '');
    setFiscalDocumentNumber('');
    if (order.customerId) {
      populateFiscalDocumentFromCustomer(order.customerId);
    }
    setCart(items);
    setMessage(`Orden ${order.orderNumber} cargada para cobrar.`);
  }

  function enableScanner() {
    setScannerEnabled(true);
    setScannerMessage(
      'Lector activo. Escanea con pistola USB o usa camara si el navegador lo soporta.',
    );
    window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
  }

  function disableScanner() {
    setScannerEnabled(false);
    setScannerMessage(null);
    stopCameraScan();
  }

  async function startCameraScan() {
    setScannerEnabled(true);
    setScannerMessage(null);

    const detectorConstructor = (window as WindowWithBarcodeDetector).BarcodeDetector;
    if (!detectorConstructor || !navigator.mediaDevices?.getUserMedia) {
      setScannerMessage(
        'Camara QR no disponible en este navegador. Usa el lector USB o escribe el codigo.',
      );
      barcodeInputRef.current?.focus();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);

      if (!videoRef.current) {
        return;
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const detector = new detectorConstructor({
        formats: ['qr_code', 'code_128', 'ean_13', 'upc_a'],
      });

      const scan = async () => {
        if (!videoRef.current || !streamRef.current) {
          return;
        }

        try {
          const results = await detector.detect(videoRef.current);
          const value = results[0]?.rawValue;
          if (value) {
            setBarcode(value);
            stopCameraScan();
            barcodeMutation.mutate(value);
            return;
          }
        } catch {
          setScannerMessage('No pude leer el codigo todavia. Manten el codigo frente a la camara.');
        }

        scanFrameRef.current = window.requestAnimationFrame(scan);
      };

      scanFrameRef.current = window.requestAnimationFrame(scan);
    } catch {
      setScannerMessage(
        'No se pudo activar la camara. Puedes usar el lector USB o escribir el codigo.',
      );
      barcodeInputRef.current?.focus();
    }
  }

  function stopCameraScan() {
    if (scanFrameRef.current) {
      window.cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }

  return (
    <div className="flex flex-col gap-2 md:h-full md:min-h-0 md:overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700 shadow-sm">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950">Caja</h1>
            <p className="text-xs text-muted-foreground">
              Cobro de reparaciones, ventas de mostrador y cierre de caja.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden text-xs font-medium capitalize text-muted-foreground sm:block">{todayLabel}</p>
          {currentCashSession && canCreateDirectSale && !loadedOrder ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCounterSaleOpen((current) => !current)}
            >
              <Plus className="h-4 w-4" /> {counterSaleOpen ? 'Ocultar mostrador' : 'Venta de mostrador'}
            </Button>
          ) : null}
        </div>
      </div>

      <CashStatusHeader
        sessionName={session.user.name}
        isOpen={Boolean(currentCashSession)}
        registerName={currentCashSession?.cashRegister.name}
        openedAt={currentCashSession?.openedAt}
        openingAmount={currentCashSession?.openingAmount}
      />

      {requestedOrderId ? (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Orden seleccionada para Caja</CardTitle>
            <CardDescription>
              {requestedOrderQuery.isPending
                ? 'Consultando la orden…'
                : requestedOrderQuery.error
                  ? 'No se pudo consultar esta orden. Verifica que esté disponible para tu usuario.'
                  : requestedOrderQuery.data
                    ? `${requestedOrderQuery.data.workshopTicket?.ticketNumber ?? requestedOrderQuery.data.orderNumber} · ${getOrderClientLabel(requestedOrderQuery.data)}`
                    : 'Orden no disponible.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {requestedOrderQuery.data?.invoice ? (
              <p className="text-sm">
                Esta orden ya está facturada.{' '}
                <Link
                  className="font-medium text-primary underline"
                  href={`/invoices/${requestedOrderQuery.data.invoice.id}/print`}
                >
                  Ver comprobante
                </Link>
              </p>
            ) : requestedOrderQuery.data &&
              ['SENT_TO_CASHIER', 'IN_CASHIER'].includes(requestedOrderQuery.data.status) ? (
              <>
                <p className="text-sm">
                  Total: <strong>{formatCurrency(Number(requestedOrderQuery.data.total))}</strong>.{' '}
                  {currentCashSession
                    ? 'Cárgala, revisa el comprobante y confirma el pago. Cargar no registra dinero.'
                    : 'Abre tu sesión de caja para iniciar el cobro.'}
                </p>
                <Button
                  type="button"
                  disabled={
                    !currentCashSession ||
                    !canCreateDirectSale ||
                    Boolean(loadedOrder) ||
                    cart.length > 0 ||
                    claimOrderMutation.isPending ||
                    completeSaleMutation.isPending ||
                    (requestedOrderQuery.data.status === 'IN_CASHIER' &&
                      requestedOrderQuery.data.claimedBy?.id !== session.user.id)
                  }
                  onClick={() => claimOrderMutation.mutate(requestedOrderQuery.data!)}
                >
                  {loadedOrder?.id === requestedOrderId
                    ? 'Orden cargada'
                    : 'Cargar orden para cobrar'}
                </Button>
                {(loadedOrder && loadedOrder.id !== requestedOrderId) ||
                (!loadedOrder && cart.length > 0) ? (
                  <p className="text-xs text-muted-foreground">
                    Termina o retira la venta actual antes de cargar otra orden.
                  </p>
                ) : null}
                {requestedOrderQuery.data.status === 'IN_CASHIER' &&
                requestedOrderQuery.data.claimedBy?.id !== session.user.id ? (
                  <p className="text-xs text-muted-foreground">
                    En atención por {requestedOrderQuery.data.claimedBy?.name ?? 'otro cajero'}.
                  </p>
                ) : null}
              </>
            ) : requestedOrderQuery.data ? (
              <p className="text-sm">Esta orden no está disponible para cobro.</p>
            ) : null}
            {requestedOrderQuery.isError ? (
              <Button type="button" variant="outline" onClick={() => requestedOrderQuery.refetch()}>
                Reintentar
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!canUsePos ? (
        <Card>
          <CardHeader>
            <CardTitle>Caja bloqueada</CardTitle>
            <CardDescription>Tu usuario no tiene permiso para operar esta caja.</CardDescription>
          </CardHeader>
        </Card>
      ) : !currentCashSession ? (
        <ClosedCashPanel
          registers={registersQuery.data ?? []}
          selectedRegisterId={selectedRegisterId}
          openingAmount={openingAmount}
          canOpenCashSession={canOpenCashSession}
          isOpening={openSessionMutation.isPending}
          message={message}
          occupiedBy={
            selectedRegisterOccupied ? (selectedOpenSession?.openedBy?.name ?? 'otro cajero') : null
          }
          onRegisterChange={setSelectedRegisterId}
          onOpeningAmountChange={setOpeningAmount}
          onOpen={() => openSessionMutation.mutate()}
        />
      ) : (
        <fieldset
          disabled={completeSaleMutation.isPending}
          className="grid min-h-0 min-w-0 flex-1 gap-2 md:grid-cols-2"
        >
          <div className="surface-scrollbar min-h-0 min-w-0 space-y-2 md:overflow-y-auto">
            <SalesOrdersQueuePanel
              orders={readyOrders}
              loading={pendingOrdersQuery.isLoading}
              failed={pendingOrdersQuery.isError}
              onRetry={() => pendingOrdersQuery.refetch()}
              loadedOrderId={loadedOrder?.id}
              currentUserId={session.user.id}
              claimingId={claimOrderMutation.variables?.id}
              canChargeOrders={canCreateDirectSale}
              onLoad={handleLoadOrder}
            />
            {canCreateDirectSale && !loadedOrder && counterSaleOpen ? (
              <Card>
                <CardHeader>
                  <CardTitle>Venta de mostrador</CardTitle>
                  <CardDescription>
                    Vende repuestos y servicios rápidos sin crear una orden de trabajo.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Label htmlFor="pos-product-search">Buscar repuesto o servicio</Label>
                  <Input
                    id="pos-product-search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Nombre, SKU, marca o código"
                  />
                  <BarcodeInput
                    barcode={barcode}
                    scannerEnabled={scannerEnabled}
                    cameraActive={cameraActive}
                    scannerMessage={scannerMessage}
                    barcodeInputRef={barcodeInputRef}
                    videoRef={videoRef}
                    isPending={barcodeMutation.isPending}
                    onBarcodeChange={setBarcode}
                    onSubmit={(code) => barcodeMutation.mutate(code)}
                    onEnableScanner={enableScanner}
                    onDisableScanner={disableScanner}
                    onStartCamera={startCameraScan}
                  />
                  {productsQuery.error ? (
                    <p role="alert" className="text-sm text-danger">
                      No se pudo cargar el catálogo.{' '}
                      <Button type="button" variant="ghost" onClick={() => productsQuery.refetch()}>
                        Reintentar
                      </Button>
                    </p>
                  ) : (
                    <PosProductGrid
                      products={filteredProducts}
                      quantitiesByProduct={quantitiesByProduct}
                      isLoading={productsQuery.isLoading}
                      onAddProduct={addProduct}
                    />
                  )}
                </CardContent>
              </Card>
            ) : null}
            {isAdmin ? (
              <Card className="border-zinc-200 bg-zinc-50">
                <CardHeader>
                  <CardTitle>Cobro solo por cajero</CardTitle>
                  <CardDescription>
                    El administrador no cobra desde caja. Los tickets pendientes deben ser cobrados
                    por un cajero con sesion abierta.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : null}
          </div>

          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-zinc-200 shadow-sm">
              <CardHeader className="shrink-0 flex-row items-center justify-between border-b border-zinc-100 px-3 py-2">
                <div>
                  <CardTitle>Cobro actual</CardTitle>
                  <CardDescription>Revisa los conceptos y completa el pago.</CardDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={clearCart}
                  disabled={!cart.length || releaseOrderMutation.isPending || completeSaleMutation.isPending}
                >
                  Limpiar
                </Button>
              </CardHeader>
              <CardContent className="surface-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-2.5 pr-2">
                {loadedOrder ? (
                  <CheckoutOrderSummary order={loadedOrder} />
                ) : cart.length ? (
                  <PosCart
                    items={cart}
                    onUpdateQuantity={updateQuantity}
                    onClear={clearCart}
                    readOnly={cartReadOnly}
                  />
                ) : (
                  <div className="grid min-h-44 place-items-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-6 text-center">
                    <div>
                      <ReceiptText className="mx-auto h-8 w-8 text-zinc-400" />
                      <p className="mt-3 font-semibold text-zinc-800">Selecciona una orden pendiente</p>
                      <p className="mt-1 text-sm text-muted-foreground">Se cargará aquí el cobro actual sin salir de esta pantalla.</p>
                    </div>
                  </div>
                )}
            {loadedOrder ? (
                <label className="flex min-h-8 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-xs">
                <input type="checkbox" checked={loadedOrder.electronicInvoiceRequested} disabled />
                <span>
                  Factura electrónica (e-CF)
                  <span className="ml-2 text-xs text-muted-foreground">
                    {loadedOrder.electronicInvoiceRequested ? 'Solicitada en la orden' : 'No solicitada'}
                  </span>
                </span>
              </label>
            ) : canCreateDirectSale && cart.length ? (
              <div className="space-y-3 rounded-md border bg-card p-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={directElectronic}
                    onChange={(event) => {
                      setDirectElectronic(event.target.checked);
                      setDocumentType(
                        event.target.checked ? 'CONSUMER_ELECTRONIC_32' : 'CONSUMER_02',
                      );
                    }}
                  />
                  Factura electrónica (e-CF)
                </label>
                {directElectronic ? (
                  <div className="space-y-2">
                    <Label htmlFor="direct-ecf-email">Correo para la copia</Label>
                    <Input
                      id="direct-ecf-email"
                      type="email"
                      value={directRecipientEmail}
                      onChange={(event) => setDirectRecipientEmail(event.target.value)}
                      placeholder="cliente@correo.com"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            {!isAdmin && cart.length ? (
              <PosPaymentPanel
                customers={activeCustomers}
                customerId={customerId}
                documentType={documentType}
                electronicInvoiceRequested={electronicInvoiceRequested}
                requiresE32Recipient={requiresE32Recipient}
                fiscalDocumentType={fiscalDocumentType}
                fiscalDocumentNumber={fiscalDocumentNumber}
                fiscalDocumentValid={fiscalDocumentValid}
                fiscalCustomerName={fiscalCustomer?.name}
                paymentMethod={paymentMethod}
                splitPayments={splitPayments}
                onSplitPaymentsChange={setSplitPayments}
                salePaymentMode={loadedOrder?.paymentMode ?? 'CASH'}
                dueDate={loadedOrder?.dueDate}
                customerLocked={Boolean(loadedOrder?.customerId)}
                amountReceived={amountReceived}
                totals={totals}
                message={message}
                canCompleteSale={canCompleteSale}
                isCompleting={completeSaleMutation.isPending}
                onCustomerChange={handleCustomerChange}
                onDocumentTypeChange={handleDocumentTypeChange}
                onFiscalDocumentTypeChange={handleFiscalDocumentTypeChange}
                onFiscalDocumentNumberChange={handleFiscalDocumentNumberChange}
                onPaymentMethodChange={changePaymentMethod}
                onAmountReceivedChange={setAmountReceived}
                onCompleteSale={() => completeSaleMutation.mutate()}
              />
            ) : null}
              </CardContent>
            </Card>

            <CloseCashLauncher
              canCloseCashSession={canCloseCashSession}
              cartHasItems={cart.length > 0}
              isClosing={closeSessionMutation.isPending}
              onOpen={requestCloseCashSession}
            />
          </div>
        </fieldset>
      )}

      <CashCloseDialog
        open={closingDialogOpen}
        cashSession={currentCashSession}
        closingAmount={closingAmount}
        cartHasItems={cart.length > 0}
        isPending={closeSessionMutation.isPending}
        onClosingAmountChange={setClosingAmount}
        onClose={() => setClosingDialogOpen(false)}
        onConfirm={() => closeSessionMutation.mutate()}
      />
    </div>
  );
}

function CheckoutOrderSummary({ order }: { order: SalesOrder }) {
  const vehicle = order.workshopTicket?.vehicle;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-start justify-between gap-3 bg-zinc-50/80 p-2.5">
        <div className="flex min-w-0 gap-3">
          <div className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            vehicle ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700',
          )}>
            {vehicle ? <Wrench className="h-5 w-5" /> : <ShoppingBag className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-zinc-950">{getOrderClientLabel(order)}</p>
              <Badge variant={vehicle ? 'default' : 'outline'}>{vehicle ? 'Taller' : 'Mostrador'}</Badge>
            </div>
            {vehicle ? (
              <p className="mt-1 text-sm text-zinc-700">
                {vehicle.make} {vehicle.model}{vehicle.year ? ` ${vehicle.year}` : ''} · {vehicle.licensePlate ?? 'Sin placa'}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {order.workshopTicket?.ticketNumber ?? order.orderNumber} · {formatDateTime(order.sentToCashierAt ?? order.createdAt)}
            </p>
          </div>
        </div>
        <Badge variant="success">Lista para cobrar</Badge>
      </div>

      <div className="surface-scrollbar max-h-[7.25rem] overflow-x-hidden overflow-y-auto overscroll-contain border-t border-zinc-200">
        <table className="w-full table-fixed text-xs">
          <thead className="sticky top-0 bg-white text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-zinc-200">
              <th className="w-[46%] px-3 py-2 font-semibold">Descripción</th>
              <th className="w-[12%] px-2 py-2 text-right font-semibold">Cant.</th>
              <th className="w-[20%] px-2 py-2 text-right font-semibold">Precio</th>
              <th className="w-[22%] px-3 py-2 text-right font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-zinc-100 last:border-0">
                <td className="truncate px-3 py-1.5 font-medium text-zinc-800" title={item.description}>{item.description}</td>
                <td className="px-2 py-1.5 text-right text-zinc-600">{Number(item.quantity).toLocaleString('es-DO')}</td>
                <td className="px-2 py-1.5 text-right text-zinc-600">{formatCurrency(Number(item.unitPrice))}</td>
                <td className="px-3 py-1.5 text-right font-semibold">{formatCurrency(Number(item.subtotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50/70 px-3 py-2">
        <div>
          <p className="text-xs text-muted-foreground">Total de la orden</p>
          <p className="text-xs text-zinc-500">{order.items.length} producto(s)</p>
        </div>
        <p className="text-lg font-bold text-zinc-950">{formatCurrency(Number(order.total))}</p>
      </div>
      {order.paymentMode === 'CREDIT' ? (
        <div className="border-t border-sky-100 bg-sky-50 px-3.5 py-2 text-xs text-sky-900">
          Crédito aprobado · Inicial <strong>{formatCurrency(Number(order.initialPaymentAmount))}</strong> · Saldo{' '}
          <strong>{formatCurrency(Number(order.total) - Number(order.initialPaymentAmount))}</strong>
        </div>
      ) : null}
    </div>
  );
}

function SalesOrdersQueuePanel({
  orders,
  loading,
  failed,
  onRetry,
  loadedOrderId,
  currentUserId,
  claimingId,
  canChargeOrders,
  onLoad,
}: {
  orders: SalesOrder[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  loadedOrderId?: string;
  currentUserId: string;
  claimingId?: string;
  canChargeOrders: boolean;
  onLoad: (order: SalesOrder) => void;
}) {
  const [queueSearch, setQueueSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [originFilter, setOriginFilter] = useState<'ALL' | 'WORKSHOP' | 'COUNTER'>('ALL');
  const normalizedSearch = queueSearch.trim().toLowerCase();
  const originOrders = orders.filter((order) =>
    originFilter === 'ALL'
      ? true
      : originFilter === 'WORKSHOP'
        ? Boolean(order.workshopTicket)
        : !order.workshopTicket,
  );
  const visibleOrders = normalizedSearch
    ? originOrders.filter((order) =>
        [
          order.orderNumber,
          order.clientName,
          getOrderClientLabel(order),
          getOrderSearchLabel(order),
          order.customer?.name,
          order.createdBy.name,
          order.claimedBy?.name,
          order.invoice?.invoiceNumber,
          order.workshopTicket?.ticketNumber,
          order.workshopTicket?.vehicle.licensePlate,
          order.workshopTicket?.vehicle.make,
          order.workshopTicket?.vehicle.model,
          String(order.total),
          formatCurrency(Number(order.total)),
          `${getWaitingMinutes(order)} min`,
          `${getWaitingMinutes(order)} minutos`,
          translateStatus(order.status),
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedSearch)),
      )
    : originOrders;

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden border-zinc-200 shadow-sm">
      <CardHeader className="shrink-0 border-b border-zinc-100 px-3 py-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Órdenes pendientes de cobro</CardTitle>
            <CardDescription>
              Taller y mostrador llegan aquí únicamente cuando están listos para cobrar.
            </CardDescription>
          </div>
          <Badge variant={orders.length ? 'warning' : 'outline'}>
            {orders.length} pendiente(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-2.5">
        <div className="mb-3 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={queueSearch}
              onChange={(event) => setQueueSearch(event.target.value)}
              className="bg-white pl-9"
              aria-label="Buscar órdenes pendientes de cobro"
              placeholder="Buscar por cliente, placa, ticket, orden o monto"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className={cn('shrink-0', filtersOpen && 'border-primary bg-primary/5 text-primary')}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <Filter className="h-4 w-4" /> <span className="hidden sm:inline">Filtros</span>
          </Button>
        </div>
        {filtersOpen ? (
          <div className="mb-3 flex flex-wrap gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
            {([
              ['ALL', 'Todos'],
              ['WORKSHOP', 'Taller'],
              ['COUNTER', 'Mostrador'],
            ] as const).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={originFilter === value ? 'default' : 'outline'}
                onClick={() => setOriginFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        ) : null}
        {failed ? (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm">
            <p>
              No se pudo actualizar la cola de cobros. No significa que no haya órdenes pendientes.
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
              Reintentar
            </Button>
          </div>
        ) : loading ? (
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-muted-foreground">
            Cargando ordenes...
          </p>
        ) : visibleOrders.length ? (
          <div className="surface-scrollbar grid min-h-0 flex-1 auto-rows-max content-start items-start gap-2 overflow-y-auto pr-1">
            {visibleOrders.map((order) => (
              <article
                key={order.id}
                tabIndex={0}
                className={getWaitingCardClass(order, loadedOrderId === order.id)}
                onClick={() => {
                  if (loadedOrderId !== order.id) onLoad(order);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (loadedOrderId !== order.id) onLoad(order);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                      order.workshopTicket ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700',
                    )}>
                      {order.workshopTicket ? <Wrench className="h-5 w-5" /> : <ShoppingBag className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-zinc-950">{getOrderClientLabel(order)}</p>
                      <Badge variant={order.workshopTicket ? 'default' : 'outline'}>
                        {order.workshopTicket ? 'Orden de taller' : 'Mostrador'}
                      </Badge>
                      {order.paymentMode === 'CREDIT' ? (
                        <Badge variant="outline">
                          {order.creditApproval?.status === 'APPROVED'
                            ? 'Crédito aprobado'
                            : 'Crédito pendiente'}
                        </Badge>
                      ) : null}
                      {order.sentToCashierAt ? (
                        <Badge variant={getWaitingVariant(order)}>
                          {getWaitingMinutes(order)} min
                        </Badge>
                      ) : null}
                    </div>
                    {order.workshopTicket ? (
                      <p className="mt-1 text-sm font-medium text-zinc-700">
                        {order.workshopTicket.vehicle.make} {order.workshopTicket.vehicle.model}
                        {order.workshopTicket.vehicle.year ? ` ${order.workshopTicket.vehicle.year}` : ''}
                        {' · '}{order.workshopTicket.vehicle.licensePlate ?? 'Sin placa'}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {order.workshopTicket?.ticketNumber ?? order.orderNumber} · {formatDateTime(order.sentToCashierAt ?? order.createdAt)}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-zinc-600">
                      {order.notes || order.items.map((item) => item.description).slice(0, 2).join(' · ')}
                    </p>
                    {order.claimedBy ? (
                      <p className="mt-1 text-xs text-warning">
                        Tomada por {order.claimedBy.name}
                        {order.claimedCashSession?.cashRegister.name
                          ? ` en ${order.claimedCashSession.cashRegister.name}`
                          : ''}
                      </p>
                    ) : null}
                    {order.paymentMode === 'CREDIT' ? (
                      <p className="mt-1 text-xs text-sky-800">
                        Inicial {formatCurrency(Number(order.initialPaymentAmount))} · Saldo{' '}
                        {formatCurrency(
                          Number(order.total) - Number(order.initialPaymentAmount ?? 0),
                        )}
                      </p>
                    ) : null}
                    </div>
                  </div>
                  <p className="shrink-0 text-base font-bold text-zinc-950">
                    {formatCurrency(Number(order.total))}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{order.workshopTicket ? 'Taller' : 'Mostrador'}</Badge>
                    <span>{order.items.length} línea(s)</span>
                  </div>
                  {canChargeOrders ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        onLoad(order);
                      }}
                      disabled={
                        loadedOrderId === order.id ||
                        claimingId === order.id ||
                        (Boolean(loadedOrderId) && loadedOrderId !== order.id) ||
                        order.status === 'CREATED' ||
                        (order.status === 'IN_CASHIER' && order.claimedBy?.id !== currentUserId)
                      }
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      {loadedOrderId === order.id
                        ? 'Cargada'
                        : order.status === 'CREATED'
                          ? 'Esperando aprobación'
                          : order.status === 'IN_CASHIER'
                            ? 'Tomada'
                            : 'Cobrar'}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Solo cajero</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center">
            <ClipboardCheck className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {orders.length
                ? 'No hay tickets que coincidan con la busqueda.'
                : 'No hay tickets pendientes de cobro.'}
            </p>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <ShieldCheck className="h-4 w-4 shrink-0" /> Solo se muestran órdenes aprobadas y listas para cobro.
        </div>
      </CardContent>
    </Card>
  );
}

function CashStatusHeader({
  sessionName,
  isOpen,
  registerName,
  openedAt,
  openingAmount,
}: {
  sessionName: string;
  isOpen: boolean;
  registerName?: string;
  openedAt?: string;
  openingAmount?: string | number | null;
}) {
  return (
    <div className="grid shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm sm:grid-cols-2 md:grid-cols-4 md:divide-x md:divide-zinc-100">
      <div className="flex items-center gap-3">
        <div className="ml-3 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <Store className="h-5 w-5" />
        </div>
        <div className="py-2 pr-3">
          <p className="text-xs text-muted-foreground">Estado</p>
          <p className="font-semibold">{isOpen ? 'Caja abierta' : 'Caja cerrada'}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><ShieldCheck className="h-4 w-4" /></div>
        <div>
          <p className="text-xs text-muted-foreground">Cajero</p>
          <p className="font-semibold">{sessionName}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><CalendarClock className="h-4 w-4" /></div>
        <div>
          <p className="text-xs text-muted-foreground">Apertura</p>
          <p className="font-semibold">{openedAt ? formatDateTime(openedAt) : 'Pendiente'}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><Banknote className="h-4 w-4" /></div>
        <div>
          <p className="text-xs text-muted-foreground">Caja / monto inicial</p>
          <p className="font-semibold">{registerName ?? 'Sin caja'} - {formatCurrency(Number(openingAmount ?? 0))}</p>
        </div>
      </div>
    </div>
  );
}

function ClosedCashPanel({
  registers,
  selectedRegisterId,
  openingAmount,
  canOpenCashSession,
  isOpening,
  message,
  occupiedBy,
  onRegisterChange,
  onOpeningAmountChange,
  onOpen,
}: {
  registers: Array<{ id: string; name: string; status: string }>;
  selectedRegisterId: string;
  openingAmount: string;
  canOpenCashSession: boolean;
  isOpening: boolean;
  message: string | null;
  occupiedBy: string | null;
  onRegisterChange: (value: string) => void;
  onOpeningAmountChange: (value: string) => void;
  onOpen: () => void;
}) {
  return (
    <Card className="overflow-hidden border-zinc-200">
      <div className="grid lg:grid-cols-[0.85fr_1.15fr]">
        <div className="bg-zinc-950 p-6 text-white">
          <Badge variant="warning">Caja cerrada</Badge>
          <h2 className="mt-4 text-2xl font-bold">
            Para iniciar ventas debes abrir una sesion de caja.
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            Declara el fondo inicial, selecciona la caja fisica y el sistema registrara la apertura,
            el movimiento de caja y la actividad del empleado.
          </p>
        </div>
        <CardContent className="p-6">
          <form
            className="grid gap-4 md:grid-cols-[1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              onOpen();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="cashRegister">Caja</Label>
              <select
                id="cashRegister"
                value={selectedRegisterId}
                onChange={(event) => onRegisterChange(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              >
                {registers.map((register) => (
                  <option key={register.id} value={register.id}>
                    {register.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="openingAmount">
                Monto inicial <span className="text-danger">*</span>
              </Label>
              <Input
                id="openingAmount"
                type="text"
                inputMode="decimal"
                value={openingAmount}
                onChange={(event) =>
                  onOpeningAmountChange(sanitizeCurrencyInput(event.target.value))
                }
                onBlur={(event) => onOpeningAmountChange(formatCurrencyInput(event.target.value))}
                onFocus={(event) => event.currentTarget.select()}
                required
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={
                  !selectedRegisterId ||
                  isOpening ||
                  !canOpenCashSession ||
                  Boolean(occupiedBy) ||
                  parseCurrencyInput(openingAmount) < 0
                }
              >
                <DoorOpen className="h-4 w-4" />
                Abrir caja
              </Button>
            </div>
          </form>
          {!canOpenCashSession ? (
            <p className="mt-3 text-sm text-danger">Tu usuario no tiene permiso para abrir caja.</p>
          ) : null}
          {occupiedBy ? (
            <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              Esta caja ya esta abierta por {occupiedBy}. Cierra esa sesion o selecciona otra caja.
            </p>
          ) : null}
          {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </div>
    </Card>
  );
}

function CloseCashLauncher({
  canCloseCashSession,
  cartHasItems,
  isClosing,
  onOpen,
}: {
  canCloseCashSession: boolean;
  cartHasItems: boolean;
  isClosing: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
          <DoorClosed className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-zinc-950">Cierre de caja</p>
          <p className="truncate text-xs text-muted-foreground">
            Revisa el resumen del turno antes de cerrar.
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="shrink-0"
        disabled={!canCloseCashSession || isClosing || cartHasItems}
        onClick={onOpen}
      >
        <DoorClosed className="h-4 w-4" /> Cerrar
      </Button>
    </div>
  );
}

function CashCloseDialog({
  open,
  cashSession,
  closingAmount,
  cartHasItems,
  isPending,
  onClosingAmountChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  cashSession: CashSession | null | undefined;
  closingAmount: string;
  cartHasItems: boolean;
  isPending: boolean;
  onClosingAmountChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const movements = cashSession?.movements ?? [];
  const cashMovements = movements.filter(
    (movement) => !movement.method || movement.method === 'CASH',
  );
  const negativeTypes = new Set(['CASH_OUT', 'REFUND', 'SUPPLIER_PAYMENT']);
  const expected = cashMovements.reduce(
    (total, movement) =>
      movement.type === 'CLOSING'
        ? total
        : negativeTypes.has(movement.type)
          ? total - Number(movement.amount)
          : total + Number(movement.amount),
    0,
  );
  const inflows = cashMovements
    .filter((movement) => !['OPENING', 'CLOSING'].includes(movement.type) && !negativeTypes.has(movement.type))
    .reduce((total, movement) => total + Number(movement.amount), 0);
  const outflows = cashMovements
    .filter((movement) => negativeTypes.has(movement.type))
    .reduce((total, movement) => total + Number(movement.amount), 0);
  const counted = parseCurrencyInput(closingAmount);
  const difference = counted - expected;
  const invoiceCount = (cashSession?.invoices ?? []).filter((invoice) => invoice.status !== 'CANCELLED').length;

  return (
    <ActionDialog
      open={open}
      title="Cerrar caja"
      description="Verifica el resumen, cuenta el efectivo físico y confirma el cierre del turno."
      tone="warning"
      size="lg"
      confirmLabel="Confirmar cierre"
      cancelLabel="Volver a caja"
      isPending={isPending}
      confirmDisabled={!cashSession || cartHasItems}
      onClose={onClose}
      onConfirm={onConfirm}
      summary={
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Caja</p>
            <p className="font-semibold">{cashSession?.cashRegister.name ?? 'Sin caja'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Apertura</p>
            <p className="font-semibold">{formatDateTime(cashSession?.openedAt)}</p>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CloseSummaryMetric label="Fondo inicial" value={formatCurrency(Number(cashSession?.openingAmount ?? 0))} />
        <CloseSummaryMetric label="Entradas en efectivo" value={formatCurrency(inflows)} />
        <CloseSummaryMetric label="Salidas en efectivo" value={formatCurrency(outflows)} />
        <CloseSummaryMetric label="Facturas emitidas" value={String(invoiceCount)} />
      </div>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Efectivo esperado</span>
          <strong className="text-lg">{formatCurrency(expected)}</strong>
        </div>
        <Label className="mt-4 block" htmlFor="closing-dialog-amount">Efectivo contado</Label>
        <div className="relative mt-2">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">RD$</span>
          <Input
            id="closing-dialog-amount"
            data-dialog-autofocus
            inputMode="decimal"
            value={closingAmount}
            onChange={(event) => onClosingAmountChange(sanitizeCurrencyInput(event.target.value))}
            onBlur={(event) => onClosingAmountChange(formatCurrencyInput(event.target.value))}
            onFocus={(event) => event.currentTarget.select()}
            className="h-12 pl-12 text-lg font-semibold"
          />
        </div>
        <div className={cn(
          'mt-3 flex items-center justify-between rounded-md px-3 py-2 text-sm',
          Math.abs(difference) < 0.005
            ? 'bg-emerald-50 text-emerald-800'
            : 'bg-amber-50 text-amber-900',
        )}>
          <span>Diferencia</span>
          <strong>{formatCurrency(difference)}</strong>
        </div>
      </div>
      {counted === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          El monto contado está en RD$0.00. Confirma solamente si la caja física realmente no tiene efectivo.
        </p>
      ) : null}
    </ActionDialog>
  );
}

function CloseSummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

function getWaitingMinutes(order: SalesOrder) {
  const startedAt = new Date(order.sentToCashierAt ?? order.createdAt).getTime();
  return Math.max(Math.floor((Date.now() - startedAt) / 60000), 0);
}

function getWaitingVariant(order: SalesOrder) {
  const minutes = getWaitingMinutes(order);

  if (minutes >= 30) {
    return 'danger' as const;
  }

  if (minutes >= 10) {
    return 'warning' as const;
  }

  return 'outline' as const;
}

function getWaitingCardClass(order: SalesOrder, selected = false) {
  const minutes = getWaitingMinutes(order);
  const base = 'cursor-pointer rounded-xl border p-3.5 outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40';

  if (selected) {
    return `${base} border-primary bg-primary/[0.06] shadow-sm`;
  }

  if (minutes >= 30) {
    return `${base} border-danger/30 bg-danger/[0.035]`;
  }

  if (minutes >= 10) {
    return `${base} border-warning/30 bg-warning/[0.05]`;
  }

  return `${base} border-zinc-200 bg-white hover:border-zinc-300`;
}
