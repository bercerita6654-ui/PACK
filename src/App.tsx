import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ExpeditionCards } from './components/ExpeditionCards';
import { QuickAddSection } from './components/QuickAddSection';
import { LogTable } from './components/LogTable';
import { ExpeditionChart } from './components/ExpeditionChart';
import { PackingSection } from './components/PackingSection';
import { ProcessedNotaSection } from './components/ProcessedNotaSection';
import { ConfirmResetModal } from './components/ConfirmResetModal';
import { HistoryModal } from './components/HistoryModal';
import { SettingsModal } from './components/SettingsModal';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { GoogleSessionModal } from './components/GoogleSessionModal';
import { GoogleSheetHistorySection } from './components/GoogleSheetHistorySection';
import { BerandaSection } from './components/BerandaSection';
import { ConfirmWorkspaceActionModal } from './components/ConfirmWorkspaceActionModal';
import { SyncProgressModal } from './components/SyncProgressModal';
import { ToastContainer } from './components/Toast';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  logout,
  refreshGoogleToken,
  isAuthExpiredError,
  invalidateStoredToken,
  getCachedUserProfile,
  getStoredAccessToken,
} from './services/googleAuth';
import {
  appendDailyRekapRow,
  appendPackingOrders,
  appendProcessedNotas,
} from './services/googleWorkspace';
import {
  DEFAULT_GOOGLE_SHEET_WEB_APP_URL,
  DEFAULT_GOOGLE_SHEET_CSV_URL,
  EXPEDITIONS,
} from './data/constants';
import {
  AppState,
  ExpeditionCode,
  PackageLog,
  ToastItem,
  ToastOptions,
  DeliveryMethod,
  ActiveTab,
  PackedOrder,
  PlatformType,
  ActiveSpreadsheet,
  ProcessedNota,
  SyncProgressInfo,
} from './types';
import {
  formatIndonesianDate,
  generateWhatsAppSummary,
  exportDailyCSV,
} from './utils/csv';
import {
  DEFAULT_DELAY_THRESHOLD_MINUTES,
  isNotaDelayed,
} from './utils/notaDelay';

export const TARGET_PACKING_SPREADSHEET_ID = '1HSUiF20wpTJbfYdpOE08gtbRzm1N8IXOrZDs-KGSvnI';
export const TARGET_PACKING_SHEET_TAB = 'Packing Reg';
export const TARGET_NOTA_SHEET_TAB = 'Nota Diproses';

export default function App() {
  const [showRekapTab, setShowRekapTab] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('app_show_rekap_tab');
      return saved !== null ? JSON.parse(saved) : false; // Default: false (disembunyikan)
    } catch {
      return false;
    }
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>('beranda');
  const [sheetHistoryFilter, setSheetHistoryFilter] = useState<'all' | 'pending' | 'overdue' | 'packed'>('all');

  const handleNavigateFromBeranda = (tab: ActiveTab, filter?: 'all' | 'pending' | 'overdue' | 'packed') => {
    if (filter) {
      setSheetHistoryFilter(filter);
    }
    setActiveTab(tab);
  };

  const handleToggleShowRekapTab = (show: boolean) => {
    setShowRekapTab(show);
    try {
      localStorage.setItem('app_show_rekap_tab', JSON.stringify(show));
    } catch (e) {
      console.error('Error saving showRekapTab:', e);
    }
    if (!show && activeTab === 'rekap') {
      setActiveTab('beranda');
    }
  };

  // Google Authentication & Workspace state
  const [user, setUser] = useState<User | null>(() => getCachedUserProfile() as User | null);
  const [accessToken, setAccessToken] = useState<string | null>(() => getStoredAccessToken());
  const [isRenewingSession, setIsRenewingSession] = useState<boolean>(false);
  const [activeSpreadsheet, setActiveSpreadsheet] = useState<ActiveSpreadsheet | null>(() => {
    try {
      const saved = localStorage.getItem('packTrack_activeSpreadsheet');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.id) return parsed;
      }
    } catch (e) {
      console.error('Error loading active spreadsheet:', e);
    }
    return {
      id: TARGET_PACKING_SPREADSHEET_ID,
      name: `Packing Reg (${TARGET_PACKING_SPREADSHEET_ID.substring(0, 8)}...)`,
      url: `https://docs.google.com/spreadsheets/d/${TARGET_PACKING_SPREADSHEET_ID}/edit`,
    };
  });
  const [isGoogleDriveModalOpen, setIsGoogleDriveModalOpen] = useState<boolean>(false);
  const [isGoogleSessionModalOpen, setIsGoogleSessionModalOpen] = useState<boolean>(false);

  // Destructive/Mutating Action Confirmation Modal
  const [workspaceConfirmModal, setWorkspaceConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    spreadsheetName: string;
    spreadsheetUrl?: string;
    details: { label: string; value: string | number }[];
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    spreadsheetName: '',
    details: [],
    action: async () => {},
  });
  const [isWorkspaceSubmitting, setIsWorkspaceSubmitting] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressInfo | null>(null);
  const [lastPackingSyncTime, setLastPackingSyncTime] = useState<number>(0);
  const [lastNotaSyncTime, setLastNotaSyncTime] = useState<number>(0);

  const [appData, setAppData] = useState<AppState>(() => {
    const today = formatIndonesianDate(new Date());
    try {
      const saved = localStorage.getItem('packTrackData');
      if (saved) {
        const parsed: AppState = JSON.parse(saved);
        if (parsed.date === today) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error loading saved state:', e);
    }
    return {
      date: today,
      counts: { JNE: 0, JNT: 0, SPX: 0, IDX: 0 },
      logs: [],
    };
  });

  // Persistent historical logs across dates
  const [allLogs, setAllLogs] = useState<PackageLog[]>(() => {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const todayFormatted = formatIndonesianDate(today);

    try {
      const saved = localStorage.getItem('packTrack_allLogs');
      if (saved) {
        const parsed: PackageLog[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((l) => ({
            ...l,
            date: l.date || todayIso,
            dateFormatted: l.dateFormatted || todayFormatted,
          }));
        }
      }
    } catch (e) {
      console.error('Error loading history logs:', e);
    }

    // Check if existing appData has logs
    try {
      const savedApp = localStorage.getItem('packTrackData');
      if (savedApp) {
        const parsed = JSON.parse(savedApp);
        if (Array.isArray(parsed?.logs) && parsed.logs.length > 0) {
          return parsed.logs.map((l: any) => ({
            ...l,
            date: l.date || todayIso,
            dateFormatted: l.dateFormatted || todayFormatted,
          }));
        }
      }
    } catch (e) {
      // ignore
    }

    // Seed realistic sample logs for previous dates (yesterday, 2 days ago)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = yesterday.toISOString().slice(0, 10);
    const yesterdayFormatted = formatIndonesianDate(yesterday);

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoIso = twoDaysAgo.toISOString().slice(0, 10);
    const twoDaysAgoFormatted = formatIndonesianDate(twoDaysAgo);

    return [
      {
        id: 'hist-yest-1',
        timestamp: '16:45:10',
        date: yesterdayIso,
        dateFormatted: yesterdayFormatted,
        expedition: 'JNT',
        amount: 25,
        method: 'pickup',
      },
      {
        id: 'hist-yest-2',
        timestamp: '15:20:00',
        date: yesterdayIso,
        dateFormatted: yesterdayFormatted,
        expedition: 'SPX',
        amount: 35,
        method: 'pickup',
      },
      {
        id: 'hist-yest-3',
        timestamp: '14:10:25',
        date: yesterdayIso,
        dateFormatted: yesterdayFormatted,
        expedition: 'JNE',
        amount: 18,
        method: 'drop off',
      },
      {
        id: 'hist-yest-4',
        timestamp: '11:05:40',
        date: yesterdayIso,
        dateFormatted: yesterdayFormatted,
        expedition: 'IDX',
        amount: 12,
        method: 'pickup',
      },
      {
        id: 'hist-2d-1',
        timestamp: '17:30:15',
        date: twoDaysAgoIso,
        dateFormatted: twoDaysAgoFormatted,
        expedition: 'SPX',
        amount: 42,
        method: 'pickup',
      },
      {
        id: 'hist-2d-2',
        timestamp: '15:15:00',
        date: twoDaysAgoIso,
        dateFormatted: twoDaysAgoFormatted,
        expedition: 'JNT',
        amount: 30,
        method: 'drop off',
      },
      {
        id: 'hist-2d-3',
        timestamp: '13:40:22',
        date: twoDaysAgoIso,
        dateFormatted: twoDaysAgoFormatted,
        expedition: 'JNE',
        amount: 20,
        method: 'pickup',
      },
    ];
  });

  // State for Paket Packing scanned orders
  const [packedOrders, setPackedOrders] = useState<PackedOrder[]>(() => {
    try {
      const saved = localStorage.getItem('packTrack_packedOrders');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((item: PackedOrder) => ({
            ...item,
            orderNumber: (item.orderNumber || '').trim().toUpperCase(),
          }));
        }
      }
    } catch (e) {
      console.error('Error loading packed orders:', e);
    }
    return [];
  });

  // State for Processed Notas (Admin Note Scanning & Packing Verification)
  const [processedNotas, setProcessedNotas] = useState<ProcessedNota[]>(() => {
    try {
      const saved = localStorage.getItem('packTrack_processedNotas');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((item: ProcessedNota) => ({
            ...item,
            orderNumber: (item.orderNumber || '').trim().toUpperCase(),
          }));
        }
      }
    } catch (e) {
      console.error('Error loading processed notas:', e);
    }
    return [];
  });

  // Configurable threshold (in minutes) for alerting stale pending notas (default: 1 hari / 1440 menit)
  const [delayThreshold, setDelayThreshold] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('packTrack_notaDelayThreshold');
      const parsed = saved ? parseInt(saved, 10) : NaN;
      // Default to 1440 (1 Hari) if empty or if previously set to small minutes (< 120m)
      if (isNaN(parsed) || parsed < 120) {
        return DEFAULT_DELAY_THRESHOLD_MINUTES;
      }
      return parsed;
    } catch {
      return DEFAULT_DELAY_THRESHOLD_MINUTES;
    }
  });

  const handleUpdateDelayThreshold = (newThreshold: number) => {
    setDelayThreshold(newThreshold);
    localStorage.setItem('packTrack_notaDelayThreshold', newThreshold.toString());
  };

  // Clock tick state to update relative elapsed times and alert badges periodically
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Compute number of delayed notas exceeding the threshold
  const delayedNotaCount = React.useMemo(() => {
    return processedNotas.filter((n) => isNotaDelayed(n, delayThreshold, nowMs)).length;
  }, [processedNotas, delayThreshold, nowMs]);

  const [webAppUrl, setWebAppUrl] = useState<string>(() => {
    return (
      localStorage.getItem('packTrack_webAppUrl') ||
      DEFAULT_GOOGLE_SHEET_WEB_APP_URL
    );
  });

  const [csvUrl, setCsvUrl] = useState<string>(() => {
    return (
      localStorage.getItem('packTrack_csvUrl') || DEFAULT_GOOGLE_SHEET_CSV_URL
    );
  });

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Show toast utility with rich options support
  const showToast = useCallback(
    (
      message: string,
      type: ToastItem['type'] = 'success',
      options?: ToastOptions
    ) => {
      const id = `${Date.now()}-${Math.random()}`;
      const duration =
        options?.duration ||
        (options?.rowsAdded !== undefined || options?.title ? 5000 : 3500);

      setToasts((prev) => [
        ...prev,
        {
          id,
          type,
          message,
          title: options?.title,
          rowsAdded: options?.rowsAdded,
          rowsSkipped: options?.rowsSkipped,
          sheetTab: options?.sheetTab,
          spreadsheetName: options?.spreadsheetName,
          duration,
        },
      ]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    },
    []
  );

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Listen to Google Firebase Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        if (token) {
          setAccessToken(token);
        }
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Save activeSpreadsheet to localStorage
  useEffect(() => {
    try {
      if (activeSpreadsheet) {
        localStorage.setItem('packTrack_activeSpreadsheet', JSON.stringify(activeSpreadsheet));
      } else {
        localStorage.removeItem('packTrack_activeSpreadsheet');
      }
    } catch (e) {
      console.error('Error saving active spreadsheet:', e);
    }
  }, [activeSpreadsheet]);

  // Handle Google Sign In / 1-Click Session Action
  const handleGoogleSessionAction = async () => {
    setIsRenewingSession(true);
    try {
      if (user || getCachedUserProfile()) {
        showToast('Memperbarui sesi Google & otomatis login...', 'info');
        const newToken = await refreshGoogleToken();
        setAccessToken(newToken);
        const cached = getCachedUserProfile();
        if (cached && !user) {
          setUser(cached as unknown as User);
        }
        showToast('Sesi Google berhasil diperbarui & terhubung!', 'success');
      } else {
        const result = await googleSignIn();
        if (result) {
          setUser(result.user);
          setAccessToken(result.accessToken);
          showToast('Berhasil masuk dengan akun Google!', 'success');
          if (!activeSpreadsheet) {
            setIsGoogleDriveModalOpen(true);
          }
        }
      }
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        showToast('Login Google dibatalkan.', 'info');
        return;
      }
      // If refresh failed because session was completely dropped, fallback to sign in popup
      try {
        const result = await googleSignIn();
        if (result) {
          setUser(result.user);
          setAccessToken(result.accessToken);
          showToast('Sesi Google berhasil terhubung!', 'success');
        }
      } catch (retryErr: any) {
        if (retryErr?.code !== 'auth/popup-closed-by-user') {
          console.error('Google session action error:', retryErr);
          showToast(retryErr?.message || 'Gagal memperbarui sesi Google.', 'error');
        }
      }
    } finally {
      setIsRenewingSession(false);
    }
  };

  const handleGoogleSignIn = handleGoogleSessionAction;

  // Handle Switch Google Account
  const handleSwitchGoogleAccount = async () => {
    setIsRenewingSession(true);
    try {
      showToast('Membuka pilihan akun Google...', 'info');
      const result = await googleSignIn(true);
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        showToast(`Berhasil masuk sebagai ${result.user.email || result.user.displayName}!`, 'success');
      }
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        console.error('Switch account error:', err);
        showToast(err?.message || 'Gagal mengganti akun Google.', 'error');
      }
    } finally {
      setIsRenewingSession(false);
    }
  };

  // Handle Google Sign Out
  const handleGoogleSignOut = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
    showToast('Berhasil keluar dari akun Google.', 'info');
  };

  // Handle Token Expiration
  const handleTokenExpired = () => {
    invalidateStoredToken();
    setAccessToken(null);
  };

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('packTrackData', JSON.stringify(appData));
    } catch (e) {
      console.error('Error saving state:', e);
    }
  }, [appData]);

  // Sync packedOrders to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('packTrack_packedOrders', JSON.stringify(packedOrders));
    } catch (e) {
      console.error('Error saving packed orders:', e);
    }
  }, [packedOrders]);

  // Sync processedNotas to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('packTrack_processedNotas', JSON.stringify(processedNotas));
    } catch (e) {
      console.error('Error saving processed notas:', e);
    }
  }, [processedNotas]);

  // Sync allLogs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('packTrack_allLogs', JSON.stringify(allLogs));
    } catch (e) {
      console.error('Error saving all logs:', e);
    }
  }, [allLogs]);

  // Helper to normalize order / resi string for robust matching across systems
  const normalizeOrderNumber = useCallback((str: string): string => {
    return (str || '')
      .trim()
      .toUpperCase()
      .replace(/[\s\-_#/.]/g, '');
  }, []);

  // Continuous auto-sync: Automatically mark matching processed notas as packed when packedOrders exists or changes
  useEffect(() => {
    if (packedOrders.length === 0 || processedNotas.length === 0) return;

    const packedExactSet = new Set<string>(
      packedOrders.map((p) => p.orderNumber.trim().toUpperCase())
    );
    const packedNormMap = new Map<string, PackedOrder>();
    packedOrders.forEach((p) => {
      const norm = normalizeOrderNumber(p.orderNumber);
      if (norm) packedNormMap.set(norm, p);
    });

    let hasChanges = false;
    const updated = processedNotas.map((nota) => {
      const upper = nota.orderNumber.trim().toUpperCase();
      const norm = normalizeOrderNumber(nota.orderNumber);
      const isExactMatch = packedExactSet.has(upper);
      const normMatch = packedNormMap.get(norm);

      if ((isExactMatch || normMatch) && !nota.isPacked) {
        hasChanges = true;
        const matchTimestamp = normMatch ? normMatch.timestamp : undefined;
        return {
          ...nota,
          isPacked: true,
          packedAt: nota.packedAt || matchTimestamp || 'Selesai',
        };
      }
      return nota;
    });

    if (hasChanges) {
      setProcessedNotas(updated);
    }
  }, [packedOrders, normalizeOrderNumber]);

  // Add scanned packed order
  const handleAddPackedOrder = (orderNumber: string, platform: PlatformType): boolean => {
    const upper = orderNumber.trim().toUpperCase();
    const norm = normalizeOrderNumber(orderNumber);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const newOrder: PackedOrder = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      orderNumber: upper,
      platform,
      timestamp: timeStr,
      date: appData.date,
    };

    setPackedOrders((prev) => [newOrder, ...prev]);

    // Automatically mark matching processed nota as packed
    setProcessedNotas((prev) =>
      prev.map((nota) => {
        const notaUpper = nota.orderNumber.trim().toUpperCase();
        const notaNorm = normalizeOrderNumber(nota.orderNumber);
        if (notaUpper === upper || (norm && notaNorm === norm)) {
          return { ...nota, isPacked: true, packedAt: timeStr };
        }
        return nota;
      })
    );

    return true;
  };

  // Add multiple scanned packed orders in batch
  const handleAddPackedOrdersBatch = (
    newItems: { orderNumber: string; platform: PlatformType }[],
    allowDuplicates: boolean = false
  ): { added: number; duplicates: number } => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const existingSet = new Set(packedOrders.map((o) => o.orderNumber.toUpperCase()));
    const batchSeen = new Set<string>();
    const toAdd: PackedOrder[] = [];
    let duplicates = 0;

    for (let i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      const upper = item.orderNumber.trim().toUpperCase();
      if (!upper) continue;

      const isDup = existingSet.has(upper) || batchSeen.has(upper);
      if (isDup) {
        duplicates++;
        if (allowDuplicates) {
          toAdd.push({
            id: `${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
            orderNumber: upper,
            platform: item.platform,
            timestamp: timeStr,
            date: appData.date,
          });
        }
      } else {
        existingSet.add(upper);
        batchSeen.add(upper);
        toAdd.push({
          id: `${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
          orderNumber: upper,
          platform: item.platform,
          timestamp: timeStr,
          date: appData.date,
        });
      }
    }

    if (toAdd.length > 0) {
      setPackedOrders((prev) => [...toAdd, ...prev]);

      // Automatically mark matching processed notas as packed
      const addedUpperSet = new Set(toAdd.map((o) => o.orderNumber.toUpperCase()));
      setProcessedNotas((prev) =>
        prev.map((nota) =>
          addedUpperSet.has(nota.orderNumber.toUpperCase())
            ? { ...nota, isPacked: true, packedAt: timeStr }
            : nota
        )
      );
    }

    return { added: toAdd.length, duplicates };
  };

  // Remove single packed order
  const handleRemovePackedOrder = (id: string) => {
    setPackedOrders((prev) => prev.filter((o) => o.id !== id));
  };

  // Clear all packed orders
  const handleClearPackedOrders = () => {
    setPackedOrders([]);
  };

  // Processed Nota Handlers (Admin)
  const handleAddProcessedNota = (
    orderNumber: string,
    platform: PlatformType,
    notes?: string
  ): { success: boolean; isDuplicate: boolean } => {
    const upper = orderNumber.trim().toUpperCase();
    if (!upper) return { success: false, isDuplicate: false };

    const isExisting = processedNotas.some((n) => n.orderNumber.toUpperCase() === upper);
    if (isExisting) {
      return { success: false, isDuplicate: true };
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const norm = normalizeOrderNumber(upper);
    const matchingPacked = packedOrders.find((p) => {
      const pUpper = p.orderNumber.trim().toUpperCase();
      const pNorm = normalizeOrderNumber(p.orderNumber);
      return pUpper === upper || (norm && pNorm === norm);
    });

    const newNota: ProcessedNota = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      orderNumber: upper,
      platform,
      timestamp: timeStr,
      date: appData.date,
      isPacked: Boolean(matchingPacked),
      packedAt: matchingPacked ? matchingPacked.timestamp : undefined,
      notes,
      createdAt: Date.now(),
    };

    setProcessedNotas((prev) => [newNota, ...prev]);
    return { success: true, isDuplicate: false };
  };

  const handleAddProcessedNotasBatch = (
    items: { orderNumber: string; platform: PlatformType; notes?: string }[],
    skipDuplicates: boolean = true
  ): { added: number; duplicates: number } => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const existingUpper = new Set<string>(processedNotas.map((n) => n.orderNumber.toUpperCase()));
    const packedUpperMap = new Map<string, PackedOrder>(
      packedOrders.map((p) => [p.orderNumber.toUpperCase(), p])
    );
    const packedNormMap = new Map<string, PackedOrder>();
    packedOrders.forEach((p) => {
      const pNorm = normalizeOrderNumber(p.orderNumber);
      if (pNorm) packedNormMap.set(pNorm, p);
    });

    const batchSeen = new Set<string>();
    const toAdd: ProcessedNota[] = [];
    let duplicates = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const upper = item.orderNumber.trim().toUpperCase();
      if (!upper) continue;
      const itemNorm = normalizeOrderNumber(upper);

      const isDup = existingUpper.has(upper) || batchSeen.has(upper);
      const match = packedUpperMap.get(upper) || (itemNorm ? packedNormMap.get(itemNorm) : undefined);

      if (isDup) {
        duplicates++;
        if (!skipDuplicates) {
          toAdd.push({
            id: `${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
            orderNumber: upper,
            platform: item.platform,
            timestamp: timeStr,
            date: appData.date,
            isPacked: Boolean(match),
            packedAt: match ? match.timestamp : undefined,
            notes: item.notes,
            createdAt: Date.now(),
          });
        }
      } else {
        existingUpper.add(upper);
        batchSeen.add(upper);
        toAdd.push({
          id: `${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
          orderNumber: upper,
          platform: item.platform,
          timestamp: timeStr,
          date: appData.date,
          isPacked: Boolean(match),
          packedAt: match ? match.timestamp : undefined,
          notes: item.notes,
          createdAt: Date.now(),
        });
      }
    }

    if (toAdd.length > 0) {
      setProcessedNotas((prev) => [...toAdd, ...prev]);
    }

    return { added: toAdd.length, duplicates };
  };

  const handleRemoveProcessedNota = (id: string) => {
    setProcessedNotas((prev) => prev.filter((n) => n.id !== id));
  };

  const handleClearProcessedNotas = () => {
    setProcessedNotas([]);
    showToast('Daftar nota berhasil direset.', 'info');
  };

  const handleToggleNotaPackedStatus = (id: string) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setProcessedNotas((prev) =>
      prev.map((nota) => {
        if (nota.id === id) {
          const nextState = !nota.isPacked;
          return {
            ...nota,
            isPacked: nextState,
            packedAt: nextState ? timeStr : undefined,
          };
        }
        return nota;
      })
    );
  };

  // Check date on interval/focus to ensure day rollover is handled
  useEffect(() => {
    const checkDay = () => {
      const today = formatIndonesianDate(new Date());
      setAppData((prev) => {
        if (prev.date !== today) {
          return {
            date: today,
            counts: { JNE: 0, JNT: 0, SPX: 0, IDX: 0 },
            logs: [],
          };
        }
        return prev;
      });
    };

    window.addEventListener('focus', checkDay);
    const timer = setInterval(checkDay, 60000);
    return () => {
      window.removeEventListener('focus', checkDay);
      clearInterval(timer);
    };
  }, []);

  // Add package handler
  const handleAddPackage = (
    expedition: ExpeditionCode,
    amount: number,
    method: DeliveryMethod = 'pickup'
  ) => {
    const finalAmount = isNaN(amount) || amount <= 0 ? 1 : amount;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const todayIso = now.toISOString().slice(0, 10);
    const dateFormatted = formatIndonesianDate(now);

    const newLog: PackageLog = {
      id: Date.now().toString(),
      timestamp: timeStr,
      date: todayIso,
      dateFormatted,
      expedition,
      amount: finalAmount,
      method,
    };

    setAllLogs((prev) => [newLog, ...prev]);
    setAppData((prev) => ({
      ...prev,
      counts: {
        ...prev.counts,
        [expedition]: (prev.counts[expedition] || 0) + finalAmount,
      },
      logs: [newLog, ...prev.logs],
    }));

    const expName = EXPEDITIONS[expedition]?.name || expedition;
    const methodLabel = method === 'drop off' ? 'Drop Off' : 'Pickup';
    showToast(`+${finalAmount} paket ${expName} (${methodLabel}) berhasil dicatat.`, 'success');
  };

  // Subtract package handler (when reducing due to mistaken input)
  const handleSubtractPackage = (
    expedition: ExpeditionCode,
    amount: number,
    method: DeliveryMethod = 'pickup'
  ) => {
    const finalAmount = isNaN(amount) || amount <= 0 ? 1 : amount;
    const currentCount = appData.counts[expedition] || 0;

    if (currentCount <= 0) {
      const expName = EXPEDITIONS[expedition]?.name || expedition;
      showToast(`Jumlah paket ${expName} sudah 0, tidak bisa dikurangi lagi.`, 'warning');
      return;
    }

    const actualDeduction = Math.min(currentCount, finalAmount);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const todayIso = now.toISOString().slice(0, 10);
    const dateFormatted = formatIndonesianDate(now);

    const newLog: PackageLog = {
      id: Date.now().toString(),
      timestamp: timeStr,
      date: todayIso,
      dateFormatted,
      expedition,
      amount: -actualDeduction,
      method,
    };

    setAllLogs((prev) => [newLog, ...prev]);
    setAppData((prev) => ({
      ...prev,
      counts: {
        ...prev.counts,
        [expedition]: Math.max(0, (prev.counts[expedition] || 0) - actualDeduction),
      },
      logs: [newLog, ...prev.logs],
    }));

    const expName = EXPEDITIONS[expedition]?.name || expedition;
    const methodLabel = method === 'drop off' ? 'Drop Off' : 'Pickup';
    showToast(`-${actualDeduction} paket ${expName} (${methodLabel}) berhasil dikurangi.`, 'info');
  };

  // Remove specific log (Undo)
  const handleRemoveLog = (logId: string) => {
    const logToRemove = allLogs.find((l) => l.id === logId) || appData.logs.find((l) => l.id === logId);
    if (!logToRemove) return;

    setAllLogs((prev) => prev.filter((l) => l.id !== logId));

    const todayIso = new Date().toISOString().slice(0, 10);
    const isToday = !logToRemove.date || logToRemove.date === todayIso;

    if (isToday) {
      setAppData((prev) => {
        const expCode = logToRemove.expedition;
        const curCount = prev.counts[expCode] || 0;
        const newCount = Math.max(0, curCount - logToRemove.amount);

        return {
          ...prev,
          counts: {
            ...prev.counts,
            [expCode]: newCount,
          },
          logs: prev.logs.filter((l) => l.id !== logId),
        };
      });
    }

    const expName = EXPEDITIONS[logToRemove.expedition]?.name || logToRemove.expedition;
    if (logToRemove.amount < 0) {
      showToast(`Pengurangan ${Math.abs(logToRemove.amount)} paket ${expName} dibatalkan (dikembalikan).`, 'info');
    } else {
      showToast(`Catatan ${logToRemove.amount} paket ${expName} dibatalkan.`, 'info');
    }
  };

  // Reset daily data
  const handleExecuteReset = () => {
    const today = formatIndonesianDate(new Date());
    const todayIso = new Date().toISOString().slice(0, 10);
    setAppData({
      date: today,
      counts: { JNE: 0, JNT: 0, SPX: 0, IDX: 0 },
      logs: [],
    });
    setAllLogs((prev) => prev.filter((l) => l.date && l.date !== todayIso));
    setIsResetModalOpen(false);
    showToast('Data hari ini berhasil direset. Catatan tanggal sebelumnya tetap aman tersimpan.', 'success');
  };

  // Sync Rekap Kiriman Paket to Google Sheet
  const handleSyncToGoogleSheet = async () => {
    const total =
      appData.counts.JNE +
      appData.counts.JNT +
      appData.counts.SPX +
      appData.counts.IDX;

    // Calculate pickup vs drop off counts from logs
    let pickupCount = 0;
    let dropOffCount = 0;
    appData.logs.forEach((log) => {
      if (log.amount > 0) {
        if (log.method === 'drop off') {
          dropOffCount += log.amount;
        } else {
          pickupCount += log.amount;
        }
      }
    });

    // If Google User & Active Spreadsheet are connected, use direct Sheets API with confirmation dialog
    if (user && accessToken && activeSpreadsheet) {
      setWorkspaceConfirmModal({
        isOpen: true,
        title: 'Simpan Rekapan Harian ke Google Sheet',
        description: `Menambahkan baris rekapan tanggal ${appData.date} ke sheet Google Drive Anda.`,
        spreadsheetName: activeSpreadsheet.name,
        spreadsheetUrl: activeSpreadsheet.url,
        details: [
          { label: 'Tanggal', value: appData.date },
          { label: 'Total Paket', value: `${total} Paket` },
          { label: 'JNE', value: `${appData.counts.JNE} paket` },
          { label: 'J&T Express', value: `${appData.counts.JNT} paket` },
          { label: 'Shopee Xpress', value: `${appData.counts.SPX} paket` },
          { label: 'ID Xpress', value: `${appData.counts.IDX} paket` },
          { label: 'Pickup / Drop Off', value: `${pickupCount} / ${dropOffCount}` },
        ],
        action: async () => {
          setIsWorkspaceSubmitting(true);
          setWorkspaceConfirmModal((prev) => ({ ...prev, isOpen: false }));
          setSyncProgress({
            isActive: true,
            title: 'Menyimpan Rekap Kiriman Paket',
            currentStage: 'Menghubungkan ke Google Sheets...',
            stageIndex: 1,
            totalStages: 5,
            percent: 10,
            totalItems: 1,
            processedItems: 0,
            newItemsAdded: 0,
            duplicateItemsSkipped: 0,
            sheetTab: 'Rekap Harian',
            spreadsheetName: activeSpreadsheet.name,
            status: 'preparing',
            detailMessage: 'Menyiapkan baris rekap harian...',
          });

          try {
            let activeToken = accessToken;
            const rowData = [
              appData.date,
              appData.counts.JNE,
              appData.counts.JNT,
              appData.counts.SPX,
              appData.counts.IDX,
              total,
              pickupCount,
              dropOffCount,
              new Date().toLocaleTimeString('id-ID'),
            ];

            const onProgress = (p: Partial<SyncProgressInfo>) => {
              setSyncProgress((prev) => (prev ? { ...prev, ...p } : null));
            };

            try {
              await appendDailyRekapRow(activeToken!, activeSpreadsheet.id, rowData, onProgress);
            } catch (initialErr: any) {
              if (isAuthExpiredError(initialErr)) {
                showToast('Memperbarui token akses Google...', 'info');
                activeToken = await refreshGoogleToken();
                setAccessToken(activeToken);
                await appendDailyRekapRow(activeToken, activeSpreadsheet.id, rowData, onProgress);
              } else {
                throw initialErr;
              }
            }

            showToast(
              `Rekap kiriman paket tanggal ${appData.date} dengan total ${total} paket (${pickupCount} Pickup, ${dropOffCount} Drop Off) berhasil disimpan ke spreadsheet Google Drive.`,
              'success',
              {
                title: 'Sinkronisasi Rekap Berhasil',
                rowsAdded: 1,
                sheetTab: 'Rekap Harian',
                spreadsheetName: activeSpreadsheet.name,
              }
            );
          } catch (err: any) {
            console.error('Error saving to Google Sheet:', err);
            setSyncProgress((prev) =>
              prev
                ? {
                    ...prev,
                    status: 'error',
                    errorMessage: err.message || 'Gagal menyimpan ke Google Sheet.',
                  }
                : null
            );
            showToast(err.message || 'Gagal menyimpan ke Google Sheet.', 'error');
          } finally {
            setIsWorkspaceSubmitting(false);
          }
        },
      });
      return;
    }

    // If user is connected with Google but no sheet selected
    if (user && !activeSpreadsheet) {
      showToast('Pilih atau buat spreadsheet di Google Drive terlebih dahulu.', 'warning');
      setIsGoogleDriveModalOpen(true);
      return;
    }

    // If not logged in to Google, check if Apps Script URL is set
    if (!user) {
      if (
        webAppUrl &&
        webAppUrl !== 'PASTE_URL_DISINI' &&
        webAppUrl.trim() !== '' &&
        webAppUrl !== DEFAULT_GOOGLE_SHEET_WEB_APP_URL
      ) {
        setIsSyncing(true);
        const payload = {
          date: appData.date,
          JNE: appData.counts.JNE,
          JNT: appData.counts.JNT,
          SPX: appData.counts.SPX,
          IDX: appData.counts.IDX,
          total,
        };

        try {
          const response = await fetch(webAppUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
          });

          const result = await response.json();
          if (result.result === 'success') {
            showToast(
              'Berhasil! 1 baris rekap harian sukses disimpan ke Google Sheet.',
              'success',
              {
                title: 'Sinkronisasi Rekap Berhasil',
                rowsAdded: 1,
                sheetTab: 'Rekap Harian',
              }
            );
          } else {
            showToast(`Gagal menyimpan: ${result.error || 'Respons gagal'}`, 'error');
          }
        } catch (error) {
          console.error('Error Sync:', error);
          showToast('Gagal koneksi! Silakan hubungkan Google Drive langsung.', 'error');
        } finally {
          setIsSyncing(false);
        }
        return;
      }

      showToast('Silakan masuk dengan akun Google untuk menyimpan langsung ke Google Drive & Sheets.', 'info');
      setIsGoogleDriveModalOpen(true);
    }
  };

  // Sync Paket Packing to Google Sheet (Tab: "Packing Reg", Spreadsheet: 1HSUiF20wpTJbfYdpOE08gtbRzm1N8IXOrZDs-KGSvnI)
  const handleSyncPackingToGoogleSheet = async () => {
    if (packedOrders.length === 0) {
      showToast('Belum ada pesanan yang di-scan untuk disimpan.', 'warning');
      return;
    }

    if (!user) {
      showToast('Silakan hubungkan akun Google Anda untuk menyimpan ke Google Sheet.', 'info');
      setIsGoogleDriveModalOpen(true);
      return;
    }

    const targetSpreadsheetId = TARGET_PACKING_SPREADSHEET_ID;
    const targetTab = TARGET_PACKING_SHEET_TAB; // "Packing Reg"
    const targetSheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;

    const shopeeCount = packedOrders.filter((o) => o.platform === 'Shopee').length;
    const tokpedCount = packedOrders.filter((o) => o.platform === 'Tokopedia/TikTok').length;

    setWorkspaceConfirmModal({
      isOpen: true,
      title: `Simpan Hasil Scan Packing ke Sheet "${targetTab}"`,
      description: `Menyimpan ${packedOrders.length} data nomor resi / pesanan ke sheet "${targetTab}". Sistem otomatis mencegah double-save jika ada nomor pesanan yang sama. Data packing paket di aplikasi akan otomatis direset setelah disimpan.`,
      spreadsheetName: `Sheet: ${targetTab} (${targetSpreadsheetId.substring(0, 8)}...${targetSpreadsheetId.slice(-6)})`,
      spreadsheetUrl: targetSheetUrl,
      details: [
        { label: 'Target Sheet', value: targetTab },
        { label: 'Total Pesanan Scan', value: `${packedOrders.length} Paket` },
        { label: 'Pesanan Shopee', value: `${shopeeCount} Paket` },
        { label: 'Tokopedia / TikTok', value: `${tokpedCount} Paket` },
        { label: 'Anti Duplikat', value: 'Cek otomatis resi sama' },
        { label: 'Setelah Simpan', value: 'Otomatis reset data paket' },
      ],
      action: async () => {
        setIsWorkspaceSubmitting(true);
        setWorkspaceConfirmModal((prev) => ({ ...prev, isOpen: false }));

        setSyncProgress({
          isActive: true,
          title: `Simpan Hasil Scan Packing (${targetTab})`,
          currentStage: 'Menghubungkan ke Google Sheets...',
          stageIndex: 1,
          totalStages: 5,
          percent: 10,
          totalItems: packedOrders.length,
          processedItems: 0,
          newItemsAdded: 0,
          duplicateItemsSkipped: 0,
          sheetTab: targetTab,
          spreadsheetName: `Sheet: ${targetTab}`,
          status: 'preparing',
          detailMessage: `Menyiapkan ${packedOrders.length} nomor pesanan...`,
        });

        try {
          let activeToken = accessToken;
          if (!activeToken) {
            activeToken = await refreshGoogleToken();
            setAccessToken(activeToken);
          }

          const rows = packedOrders.map((o, idx) => [
            idx + 1,
            o.orderNumber,
            o.platform,
            o.date,
            o.timestamp,
            'Selesai Packing',
          ]);

          const onProgress = (p: Partial<SyncProgressInfo>) => {
            setSyncProgress((prev) => (prev ? { ...prev, ...p } : null));
          };

          let saveResult;
          try {
            saveResult = await appendPackingOrders(activeToken, targetSpreadsheetId, rows, targetTab, onProgress);
          } catch (initialErr: any) {
            if (isAuthExpiredError(initialErr)) {
              showToast('Memperbarui token akses Google...', 'info');
              activeToken = await refreshGoogleToken();
              setAccessToken(activeToken);
              saveResult = await appendPackingOrders(activeToken, targetSpreadsheetId, rows, targetTab, onProgress);
            } else {
              throw initialErr;
            }
          }

          // Otomatis reset data packing paket setelah klik simpan ke Google Sheet
          handleClearPackedOrders();

          // Berikan notifikasi akurat mengenai hasil simpan & duplikasi
          if (saveResult.added > 0 && saveResult.skippedDuplicates === 0) {
            showToast(
              `Semua ${saveResult.added} nomor resi/pesanan berhasil diunggah ke sheet "${saveResult.targetSheet}". Data sesi scan packing telah otomatis direset.`,
              'success',
              {
                title: 'Sinkronisasi Packing Berhasil',
                rowsAdded: saveResult.added,
                rowsSkipped: 0,
                sheetTab: saveResult.targetSheet || targetTab,
              }
            );
          } else if (saveResult.added > 0 && saveResult.skippedDuplicates > 0) {
            showToast(
              `${saveResult.added} nomor resi baru berhasil disimpan ke Google Sheet. Sebanyak ${saveResult.skippedDuplicates} pesanan dilewati karena sudah ada di sheet "${saveResult.targetSheet}" (mencegah duplikat). Data packing telah direset.`,
              'success',
              {
                title: 'Sinkronisasi Packing Selesai',
                rowsAdded: saveResult.added,
                rowsSkipped: saveResult.skippedDuplicates,
                sheetTab: saveResult.targetSheet || targetTab,
              }
            );
          } else {
            showToast(
              `Semua ${saveResult.skippedDuplicates} nomor pesanan sudah pernah tersimpan sebelumnya di sheet "${saveResult.targetSheet}". Tidak ada baris baru yang diunggah. Data packing telah direset.`,
              'info',
              {
                title: 'Data Sudah Tersimpan',
                rowsAdded: 0,
                rowsSkipped: saveResult.skippedDuplicates,
                sheetTab: saveResult.targetSheet || targetTab,
              }
            );
          }

          setLastPackingSyncTime(Date.now());
        } catch (err: any) {
          console.error('Error saving packed orders:', err);
          setSyncProgress((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'error',
                  errorMessage: err.message || 'Gagal menyimpan ke Google Sheet.',
                }
              : null
          );
          showToast(err.message || 'Gagal menyimpan ke Google Sheet.', 'error');
        } finally {
          setIsWorkspaceSubmitting(false);
        }
      },
    });
  };

  // Sync Processed Notas to Google Sheet (Tab: "Nota Diproses", Spreadsheet: 1HSUiF20wpTJbfYdpOE08gtbRzm1N8IXOrZDs-KGSvnI)
  const handleSyncNotasToGoogleSheet = async () => {
    if (processedNotas.length === 0) {
      showToast('Belum ada nota diproses di antrean lokal untuk disimpan.', 'warning');
      return;
    }

    if (!user) {
      showToast('Silakan hubungkan akun Google Anda untuk menyimpan ke Google Sheet.', 'info');
      setIsGoogleDriveModalOpen(true);
      return;
    }

    const targetSpreadsheetId = TARGET_PACKING_SPREADSHEET_ID;
    const targetTab = TARGET_NOTA_SHEET_TAB; // "Nota Diproses"
    const targetSheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;

    const packedCount = processedNotas.filter((n) => n.isPacked).length;
    const pendingCount = processedNotas.length - packedCount;

    setWorkspaceConfirmModal({
      isOpen: true,
      title: 'Simpan Data Nota Diproses ke Google Sheet',
      description: `Menyimpan ${processedNotas.length} data nota admin ke tab "${targetTab}". Sistem otomatis mencegah duplikasi jika nomor nota sudah ada di sheet. Setelah berhasil disimpan, seluruh nota di antrean sesi scan lokal akan otomatis terhapus/dikosongkan.`,
      spreadsheetName: `Google Spreadsheet (${targetTab})`,
      spreadsheetUrl: targetSheetUrl,
      details: [
        { label: 'Tab Tujuan', value: targetTab },
        { label: 'Total Nota Disimpan', value: `${processedNotas.length} nota` },
        { label: 'Sudah Packing', value: `${packedCount} nota` },
        { label: 'Belum Packing', value: `${pendingCount} nota` },
        { label: 'Pencegahan Duplikat', value: 'Aktif (Nota ganda otomatis dilewati)' },
        { label: 'Setelah Disimpan', value: 'Otomatis terhapus dari sesi scan lokal' },
      ],
      action: async () => {
        setIsWorkspaceSubmitting(true);
        setWorkspaceConfirmModal((prev) => ({ ...prev, isOpen: false }));

        setSyncProgress({
          isActive: true,
          title: `Simpan Data Nota Diproses (${targetTab})`,
          currentStage: 'Menghubungkan ke Google Sheets...',
          stageIndex: 1,
          totalStages: 5,
          percent: 10,
          totalItems: processedNotas.length,
          processedItems: 0,
          newItemsAdded: 0,
          duplicateItemsSkipped: 0,
          sheetTab: targetTab,
          spreadsheetName: `Sheet: ${targetTab}`,
          status: 'preparing',
          detailMessage: `Menyiapkan ${processedNotas.length} data nota...`,
        });

        try {
          let activeToken = accessToken;
          if (!activeToken) {
            activeToken = await refreshGoogleToken();
            setAccessToken(activeToken);
          }

          const rows = processedNotas.map((nota, idx) => [
            idx + 1,
            nota.orderNumber,
            nota.platform,
            nota.date,
            nota.timestamp,
            nota.isPacked ? 'Selesai Packing' : 'Belum Packing',
            nota.packedAt || '-',
            nota.notes || '',
          ]);

          const onProgress = (p: Partial<SyncProgressInfo>) => {
            setSyncProgress((prev) => (prev ? { ...prev, ...p } : null));
          };

          let saveResult;
          try {
            saveResult = await appendProcessedNotas(activeToken, targetSpreadsheetId, rows, targetTab, onProgress);
          } catch (initialErr: any) {
            if (isAuthExpiredError(initialErr)) {
              showToast('Memperbarui token akses Google...', 'info');
              activeToken = await refreshGoogleToken();
              setAccessToken(activeToken);
              saveResult = await appendProcessedNotas(activeToken, targetSpreadsheetId, rows, targetTab, onProgress);
            } else {
              throw initialErr;
            }
          }

          // Otomatis hapus / kosongkan daftar nota dari sesi scan lokal setelah tersimpan ke Google Sheet
          setProcessedNotas([]);

          if (saveResult.added > 0 && saveResult.skippedDuplicates === 0) {
            showToast(
              `Semua ${saveResult.added} data nota admin berhasil diunggah ke tab "${saveResult.targetSheet}" Google Sheet. Antrean sesi scan lokal telah otomatis dikosongkan.`,
              'success',
              {
                title: 'Sinkronisasi Nota Berhasil',
                rowsAdded: saveResult.added,
                rowsSkipped: 0,
                sheetTab: saveResult.targetSheet || targetTab,
              }
            );
          } else if (saveResult.added > 0 && saveResult.skippedDuplicates > 0) {
            showToast(
              `${saveResult.added} nota baru berhasil diunggah ke tab "${saveResult.targetSheet}". Sebanyak ${saveResult.skippedDuplicates} nota dilewati karena nomor pesanan sudah ada di sheet. Sesi scan lokal telah dikosongkan.`,
              'success',
              {
                title: 'Sinkronisasi Nota Selesai',
                rowsAdded: saveResult.added,
                rowsSkipped: saveResult.skippedDuplicates,
                sheetTab: saveResult.targetSheet || targetTab,
              }
            );
          } else {
            showToast(
              `Semua ${saveResult.skippedDuplicates} nota sudah tercatat sebelumnya di sheet "${saveResult.targetSheet}". Tidak ada baris baru yang diunggah. Sesi scan lokal telah dikosongkan.`,
              'info',
              {
                title: 'Semua Nota Sudah Tercatat',
                rowsAdded: 0,
                rowsSkipped: saveResult.skippedDuplicates,
                sheetTab: saveResult.targetSheet || targetTab,
              }
            );
          }

          setLastNotaSyncTime(Date.now());
        } catch (err: any) {
          console.error('Error saving processed notas:', err);
          setSyncProgress((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'error',
                  errorMessage: err.message || 'Gagal menyimpan data nota ke Google Sheet.',
                }
              : null
          );
          showToast(err.message || 'Gagal menyimpan data nota ke Google Sheet.', 'error');
        } finally {
          setIsWorkspaceSubmitting(false);
        }
      },
    });
  };

  // Share formatted WhatsApp summary
  const handleShareWhatsApp = async () => {
    const text = generateWhatsAppSummary(appData);
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        showToast('Teks rekap berhasil disalin! Silakan paste di WhatsApp.', 'success');
      } else {
        showToast('Teks rekap dibuat.', 'info');
      }
    } catch (e) {
      showToast('Gagal menyalin teks ke clipboard.', 'warning');
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    exportDailyCSV(appData);
    showToast('File CSV berhasil diunduh.', 'success');
  };

  // Save custom URLs
  const handleSaveUrls = (newWebAppUrl: string, newCsvUrl: string) => {
    setWebAppUrl(newWebAppUrl);
    setCsvUrl(newCsvUrl);
    localStorage.setItem('packTrack_webAppUrl', newWebAppUrl);
    localStorage.setItem('packTrack_csvUrl', newCsvUrl);
    showToast('Pengaturan Google Sheets berhasil diperbarui.', 'success');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
        {/* Header */}
        <Header
          appData={appData}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          packingCount={packedOrders.length}
          notaCount={processedNotas.length}
          pendingNotaCount={processedNotas.filter((n) => !n.isPacked).length}
          delayedNotaCount={delayedNotaCount}
          showRekapTab={showRekapTab}
          user={user}
          accessToken={accessToken}
          activeSpreadsheet={activeSpreadsheet}
          onOpenGoogleDriveModal={() => setIsGoogleDriveModalOpen(true)}
          onOpenSessionModal={() => setIsGoogleSessionModalOpen(true)}
          onGoogleSignIn={() => setIsGoogleSessionModalOpen(true)}
          onRenewSession={() => setIsGoogleSessionModalOpen(true)}
          isRenewingSession={isRenewingSession}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onShareWhatsApp={handleShareWhatsApp}
          onExportCSV={handleExportCSV}
        />

        {showRekapTab && activeTab === 'rekap' && (
          <>
            {/* 4 Expedition Summary Cards */}
            <ExpeditionCards counts={appData.counts} />

            {/* Quick Add Section */}
            <QuickAddSection
              onAddPackage={handleAddPackage}
              onSubtractPackage={handleSubtractPackage}
            />

            {/* Logs Table (Left 2 cols) and Chart (Right 1 col) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-start">
              <div className="lg:col-span-2">
                <LogTable
                  logs={allLogs}
                  todayLogsCount={appData.logs.length}
                  currentDate={appData.date}
                  isSyncing={isSyncing || isWorkspaceSubmitting}
                  onRemoveLog={handleRemoveLog}
                  onPromptReset={() => setIsResetModalOpen(true)}
                  onSyncGoogleSheet={handleSyncToGoogleSheet}
                  onOpenHistory={() => setIsHistoryModalOpen(true)}
                  showToast={showToast}
                />
              </div>

              <div className="lg:col-span-1">
                <ExpeditionChart counts={appData.counts} />
              </div>
            </div>
          </>
        )}

        {activeTab === 'beranda' && (
          /* Beranda Dashboard Operasional Section */
          <BerandaSection
            accessToken={accessToken}
            userEmail={user?.email}
            onLoginGoogle={() => setIsGoogleSessionModalOpen(true)}
            onTokenExpired={handleTokenExpired}
            targetSpreadsheetId={TARGET_PACKING_SPREADSHEET_ID}
            targetNotaTab={TARGET_NOTA_SHEET_TAB}
            targetPackingTab={TARGET_PACKING_SHEET_TAB}
            lastSyncTimestamp={Math.max(lastPackingSyncTime, lastNotaSyncTime)}
            delayThreshold={delayThreshold}
            showToast={showToast}
            onNavigateToTab={handleNavigateFromBeranda}
            packedOrders={packedOrders}
            localNotas={processedNotas}
            activeSpreadsheet={activeSpreadsheet}
            showRekapTab={showRekapTab}
            rekapTotalCount={appData.counts.JNE + appData.counts.JNT + appData.counts.SPX + appData.counts.IDX}
          />
        )}

        {activeTab === 'packing' && (
          /* Paket Packing Scanner Section */
          <PackingSection
            orders={packedOrders}
            onAddOrder={handleAddPackedOrder}
            onAddOrdersBatch={handleAddPackedOrdersBatch}
            onRemoveOrder={handleRemovePackedOrder}
            onClearOrders={handleClearPackedOrders}
            onSyncGoogleSheet={handleSyncPackingToGoogleSheet}
            isSyncing={isWorkspaceSubmitting}
            showToast={showToast}
            accessToken={accessToken}
            userEmail={user?.email}
            onLoginGoogle={() => setIsGoogleSessionModalOpen(true)}
            onTokenExpired={handleTokenExpired}
            targetSpreadsheetId={TARGET_PACKING_SPREADSHEET_ID}
            targetSheetTab={TARGET_PACKING_SHEET_TAB}
            lastSyncTimestamp={lastPackingSyncTime}
            processedNotas={processedNotas}
            delayThreshold={delayThreshold}
            onNavigateToNotas={() => setActiveTab('nota')}
            onNavigateToSheetHistory={() => setActiveTab('sheet_history')}
            onNavigateToBeranda={() => setActiveTab('beranda')}
          />
        )}

        {activeTab === 'nota' && (
          /* Scan Nota Diproses Admin Section */
          <ProcessedNotaSection
            notas={processedNotas}
            packedOrders={packedOrders}
            onAddNota={handleAddProcessedNota}
            onAddNotasBatch={handleAddProcessedNotasBatch}
            onRemoveNota={handleRemoveProcessedNota}
            onClearNotas={handleClearProcessedNotas}
            onTogglePackedStatus={handleToggleNotaPackedStatus}
            onSyncGoogleSheet={handleSyncNotasToGoogleSheet}
            isSyncing={isWorkspaceSubmitting}
            showToast={showToast}
            accessToken={accessToken}
            userEmail={user?.email}
            onLoginGoogle={() => setIsGoogleSessionModalOpen(true)}
            onTokenExpired={handleTokenExpired}
            targetSpreadsheetId={TARGET_PACKING_SPREADSHEET_ID}
            targetSheetTab={TARGET_NOTA_SHEET_TAB}
            lastSyncTimestamp={lastNotaSyncTime}
            onNavigateToPacking={() => setActiveTab('packing')}
            onNavigateToSheetHistory={() => setActiveTab('sheet_history')}
            onNavigateToBeranda={() => setActiveTab('beranda')}
            delayThreshold={delayThreshold}
            onDelayThresholdChange={handleUpdateDelayThreshold}
          />
        )}

        {activeTab === 'sheet_history' && (
          /* Dedicated Google Sheet History Section */
          <GoogleSheetHistorySection
            accessToken={accessToken}
            userEmail={user?.email}
            onLoginGoogle={() => setIsGoogleSessionModalOpen(true)}
            onTokenExpired={handleTokenExpired}
            targetSpreadsheetId={TARGET_PACKING_SPREADSHEET_ID}
            targetPackingTab={TARGET_PACKING_SHEET_TAB}
            targetNotaTab={TARGET_NOTA_SHEET_TAB}
            lastSyncTimestamp={Math.max(lastPackingSyncTime, lastNotaSyncTime)}
            showToast={showToast}
            packedOrders={packedOrders}
            localNotas={processedNotas}
            activeSpreadsheet={activeSpreadsheet}
            csvUrl={csvUrl}
            showRekapTab={showRekapTab}
            initialFilter={sheetHistoryFilter}
            onFilterChange={setSheetHistoryFilter}
          />
        )}
      </div>

      {/* Google Workspace Action Confirmation Modal */}
      <ConfirmWorkspaceActionModal
        isOpen={workspaceConfirmModal.isOpen}
        onClose={() => setWorkspaceConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={workspaceConfirmModal.action}
        title={workspaceConfirmModal.title}
        description={workspaceConfirmModal.description}
        spreadsheetName={workspaceConfirmModal.spreadsheetName}
        spreadsheetUrl={workspaceConfirmModal.spreadsheetUrl}
        details={workspaceConfirmModal.details}
        isSubmitting={isWorkspaceSubmitting}
      />

      {/* Sync Progress Indicator Modal for Google Sheets upload */}
      <SyncProgressModal
        progress={syncProgress}
        onClose={() => setSyncProgress(null)}
        spreadsheetUrl={
          activeSpreadsheet?.url ||
          `https://docs.google.com/spreadsheets/d/${TARGET_PACKING_SPREADSHEET_ID}/edit`
        }
      />

      {/* Google Session & Authentication Pop-up Modal */}
      <GoogleSessionModal
        isOpen={isGoogleSessionModalOpen}
        onClose={() => setIsGoogleSessionModalOpen(false)}
        user={user}
        accessToken={accessToken}
        isRenewingSession={isRenewingSession}
        onRenewSession={handleGoogleSessionAction}
        onSwitchAccount={handleSwitchGoogleAccount}
        onSignOut={handleGoogleSignOut}
        onOpenDriveManager={() => setIsGoogleDriveModalOpen(true)}
        activeSpreadsheet={activeSpreadsheet}
        showToast={showToast}
      />

      {/* Google Drive & Sheets Manager Modal */}
      <GoogleDriveModal
        isOpen={isGoogleDriveModalOpen}
        onClose={() => setIsGoogleDriveModalOpen(false)}
        user={user}
        accessToken={accessToken}
        onSignIn={handleGoogleSignIn}
        onSignOut={handleGoogleSignOut}
        onTokenExpired={handleTokenExpired}
        activeSpreadsheet={activeSpreadsheet}
        onSelectSpreadsheet={(sheet) => setActiveSpreadsheet(sheet)}
        showToast={showToast}
      />

      {/* Confirmation Reset Modal */}
      <ConfirmResetModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleExecuteReset}
      />

      {/* Server Data History Modal */}
      <HistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        csvUrl={csvUrl}
        activeSpreadsheet={activeSpreadsheet}
        accessToken={accessToken}
        onTokenExpired={handleTokenExpired}
        initialTab={activeTab === 'packing' ? 'Packing Reg' : 'Rekap Harian'}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        webAppUrl={webAppUrl}
        csvUrl={csvUrl}
        onSaveUrls={handleSaveUrls}
        showRekapTab={showRekapTab}
        onToggleShowRekapTab={handleToggleShowRekapTab}
      />

      {/* Floating Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

