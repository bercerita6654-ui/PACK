import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ExpeditionCards } from './components/ExpeditionCards';
import { QuickAddSection } from './components/QuickAddSection';
import { LogTable } from './components/LogTable';
import { ExpeditionChart } from './components/ExpeditionChart';
import { PackingSection } from './components/PackingSection';
import { ConfirmResetModal } from './components/ConfirmResetModal';
import { HistoryModal } from './components/HistoryModal';
import { SettingsModal } from './components/SettingsModal';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { ConfirmWorkspaceActionModal } from './components/ConfirmWorkspaceActionModal';
import { ToastContainer } from './components/Toast';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, logout } from './services/googleAuth';
import { appendDailyRekapRow, appendPackingOrders } from './services/googleWorkspace';
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
  DeliveryMethod,
  ActiveTab,
  PackedOrder,
  PlatformType,
  ActiveSpreadsheet,
} from './types';
import {
  formatIndonesianDate,
  generateWhatsAppSummary,
  exportDailyCSV,
} from './utils/csv';

export const TARGET_PACKING_SPREADSHEET_ID = '1HSUiF20wpTJbfYdpOE08gtbRzm1N8IXOrZDs-KGSvnI';
export const TARGET_PACKING_SHEET_TAB = 'Packing Reg';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('packing');

  // Google Authentication & Workspace state
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
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
  const [lastPackingSyncTime, setLastPackingSyncTime] = useState<number>(0);

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

  // Show toast utility
  const showToast = useCallback(
    (message: string, type: ToastItem['type'] = 'success') => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, type, message }]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
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
        setAccessToken(token);
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

  // Handle Google Sign In
  const handleGoogleSignIn = async () => {
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        showToast('Berhasil masuk dengan akun Google!', 'success');
        if (!activeSpreadsheet) {
          setIsGoogleDriveModalOpen(true);
        }
      }
    } catch (err: any) {
      console.error('Google sign in error:', err);
      showToast(err.message || 'Gagal login dengan akun Google.', 'error');
    }
  };

  // Handle Google Sign Out
  const handleGoogleSignOut = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
    showToast('Berhasil keluar dari akun Google.', 'info');
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

  // Sync allLogs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('packTrack_allLogs', JSON.stringify(allLogs));
    } catch (e) {
      console.error('Error saving all logs:', e);
    }
  }, [allLogs]);

  // Add scanned packed order
  const handleAddPackedOrder = (orderNumber: string, platform: PlatformType): boolean => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const newOrder: PackedOrder = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      orderNumber: orderNumber.trim().toUpperCase(),
      platform,
      timestamp: timeStr,
      date: appData.date,
    };

    setPackedOrders((prev) => [newOrder, ...prev]);
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
          try {
            await appendDailyRekapRow(accessToken, activeSpreadsheet.id, [
              appData.date,
              appData.counts.JNE,
              appData.counts.JNT,
              appData.counts.SPX,
              appData.counts.IDX,
              total,
              pickupCount,
              dropOffCount,
              new Date().toLocaleTimeString('id-ID'),
            ]);
            showToast('Sukses! Rekap kiriman paket berhasil disimpan ke Google Sheet.', 'success');
            setWorkspaceConfirmModal((prev) => ({ ...prev, isOpen: false }));
          } catch (err: any) {
            console.error('Error saving to Google Sheet:', err);
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
            showToast('Berhasil! Data sukses disimpan ke Google Sheet.', 'success');
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

    if (!user || !accessToken) {
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
      description: `Menambahkan ${packedOrders.length} data nomor resi / pesanan yang telah di-scan ke sheet "${targetTab}" pada spreadsheet 1HSUiF20wpTJbfYdpOE08gtbRzm1N8IXOrZDs-KGSvnI.`,
      spreadsheetName: `Sheet: ${targetTab} (${targetSpreadsheetId.substring(0, 8)}...${targetSpreadsheetId.slice(-6)})`,
      spreadsheetUrl: targetSheetUrl,
      details: [
        { label: 'Target Sheet', value: targetTab },
        { label: 'Spreadsheet ID', value: targetSpreadsheetId },
        { label: 'Total Pesanan', value: `${packedOrders.length} Paket` },
        { label: 'Pesanan Shopee', value: `${shopeeCount} Paket` },
        { label: 'Tokopedia / TikTok', value: `${tokpedCount} Paket` },
        { label: 'Tanggal Scan', value: appData.date },
      ],
      action: async () => {
        setIsWorkspaceSubmitting(true);
        try {
          const rows = packedOrders.map((o, idx) => [
            idx + 1,
            o.orderNumber,
            o.platform,
            o.date,
            o.timestamp,
            'Selesai Packing',
          ]);
          await appendPackingOrders(accessToken, targetSpreadsheetId, rows, targetTab);
          showToast(`${packedOrders.length} paket packing berhasil disimpan ke sheet "${targetTab}"!`, 'success');
          setLastPackingSyncTime(Date.now());
          setWorkspaceConfirmModal((prev) => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          console.error('Error saving packed orders:', err);
          showToast(err.message || 'Gagal menyimpan ke Google Sheet.', 'error');
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
          user={user}
          activeSpreadsheet={activeSpreadsheet}
          onOpenGoogleDriveModal={() => setIsGoogleDriveModalOpen(true)}
          onGoogleSignIn={handleGoogleSignIn}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onShareWhatsApp={handleShareWhatsApp}
          onExportCSV={handleExportCSV}
        />

        {activeTab === 'rekap' ? (
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
        ) : (
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
            onLoginGoogle={handleGoogleSignIn}
            targetSpreadsheetId={TARGET_PACKING_SPREADSHEET_ID}
            targetSheetTab={TARGET_PACKING_SHEET_TAB}
            lastSyncTimestamp={lastPackingSyncTime}
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

      {/* Google Drive & Sheets Manager Modal */}
      <GoogleDriveModal
        isOpen={isGoogleDriveModalOpen}
        onClose={() => setIsGoogleDriveModalOpen(false)}
        user={user}
        accessToken={accessToken}
        onSignIn={handleGoogleSignIn}
        onSignOut={handleGoogleSignOut}
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
        initialTab={activeTab === 'packing' ? 'Packing Reg' : 'Rekap Harian'}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        webAppUrl={webAppUrl}
        csvUrl={csvUrl}
        onSaveUrls={handleSaveUrls}
      />

      {/* Floating Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

