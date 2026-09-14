export { isAuthExpiredError, invalidateStoredToken } from './googleAuth';
import { isAuthExpiredError } from './googleAuth';
import { normalizeOrderNumber, PackingRegRecord } from '../utils/notaDelay';
import { SyncProgressInfo, PlatformType } from '../types';

export interface DriveSpreadsheetItem {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface SheetMetadata {
  id: string;
  title: string;
  sheets: { id: number; title: string }[];
}

/**
 * List spreadsheets available in user's Google Drive
 */
export async function listSpreadsheets(
  accessToken: string
): Promise<DriveSpreadsheetItem[]> {
  const query = encodeURIComponent(
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  const fields = encodeURIComponent('files(id, name, modifiedTime, webViewLink)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime%20desc&pageSize=30`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gagal mengambil daftar file Google Drive: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Get spreadsheet details and sheet tabs list
 */
export async function getSpreadsheetDetails(
  accessToken: string,
  spreadsheetId: string
): Promise<SheetMetadata> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gagal membaca metadata Google Sheet: ${res.status} - ${err}`);
  }

  const data = await res.json();
  return {
    id: data.spreadsheetId,
    title: data.properties?.title || 'Spreadsheet Tanpa Judul',
    sheets: (data.sheets || []).map((s: { properties: { sheetId: number; title: string } }) => ({
      id: s.properties.sheetId,
      title: s.properties.title,
    })),
  };
}

/**
 * Create a new ready-to-use Spreadsheet in Google Drive with Rekap & Packing tabs
 */
export async function createRekapSpreadsheet(
  accessToken: string,
  title: string = 'Rekap Kiriman & Packing Paket'
): Promise<{ id: string; url: string }> {
  const payload = {
    properties: {
      title,
    },
    sheets: [
      {
        properties: {
          title: 'Rekap Harian',
          gridProperties: { rowCount: 200, columnCount: 10, frozenRowCount: 1 },
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: [
                  { userEnteredValue: { stringValue: 'Tanggal' } },
                  { userEnteredValue: { stringValue: 'JNE' } },
                  { userEnteredValue: { stringValue: 'J&T' } },
                  { userEnteredValue: { stringValue: 'SPX' } },
                  { userEnteredValue: { stringValue: 'ID Xpress' } },
                  { userEnteredValue: { stringValue: 'Total Paket' } },
                  { userEnteredValue: { stringValue: 'Pickup' } },
                  { userEnteredValue: { stringValue: 'Drop Off' } },
                  { userEnteredValue: { stringValue: 'Waktu Simpan' } },
                ],
              },
            ],
          },
        ],
      },
      {
        properties: {
          title: 'Paket Packing',
          gridProperties: { rowCount: 500, columnCount: 8, frozenRowCount: 1 },
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: [
                  { userEnteredValue: { stringValue: 'No' } },
                  { userEnteredValue: { stringValue: 'No Pesanan' } },
                  { userEnteredValue: { stringValue: 'Platform' } },
                  { userEnteredValue: { stringValue: 'Tanggal' } },
                  { userEnteredValue: { stringValue: 'Waktu Scan' } },
                  { userEnteredValue: { stringValue: 'Status' } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gagal membuat spreadsheet baru: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const id = data.spreadsheetId;
  return {
    id,
    url: `https://docs.google.com/spreadsheets/d/${id}/edit`,
  };
}

/**
 * Append row to Rekap Harian sheet
 */
export async function appendDailyRekapRow(
  accessToken: string,
  spreadsheetId: string,
  rowData: (string | number)[],
  onProgress?: (progress: Partial<SyncProgressInfo>) => void
): Promise<void> {
  onProgress?.({
    isActive: true,
    title: 'Menyimpan Rekap Kiriman Paket',
    currentStage: 'Menghubungkan ke Google Sheets...',
    stageIndex: 1,
    totalStages: 5,
    percent: 20,
    totalItems: 1,
    processedItems: 0,
    newItemsAdded: 0,
    duplicateItemsSkipped: 0,
    status: 'preparing',
    detailMessage: 'Memeriksa tab Rekap Harian...',
  });

  // Check available sheets first to target the right tab
  const details = await getSpreadsheetDetails(accessToken, spreadsheetId);
  const targetSheet =
    details.sheets.find((s) => s.title.toLowerCase().includes('rekap'))?.title ||
    details.sheets[0]?.title ||
    'Sheet1';

  onProgress?.({
    currentStage: `Menyiapkan baris data untuk "${targetSheet}"...`,
    stageIndex: 3,
    percent: 60,
    sheetTab: targetSheet,
    status: 'uploading',
    detailMessage: 'Mengunggah rekap hitungan ekspedisi hari ini...',
  });

  const range = `${encodeURIComponent(targetSheet)}!A1`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [rowData],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gagal menambahkan data ke Google Sheet: ${res.status} - ${err}`);
  }

  onProgress?.({
    currentStage: 'Rekap Berhasil Disimpan!',
    stageIndex: 5,
    percent: 100,
    newItemsAdded: 1,
    processedItems: 1,
    status: 'success',
    detailMessage: `Berhasil menambahkan rekap harian ke sheet "${targetSheet}"!`,
  });
}

export interface AppendPackingOrdersResult {
  added: number;
  skippedDuplicates: number;
  skippedOrders: string[];
  targetSheet: string;
}

/**
 * Append multiple rows of scanned packed orders to Google Sheet (e.g. Packing Reg)
 * Automatically verifies existing sheet rows to prevent duplicate order numbers / resi.
 * Supports batch chunking with real-time onProgress visualization.
 */
export async function appendPackingOrders(
  accessToken: string,
  spreadsheetId: string,
  rows: (string | number)[][],
  sheetTab: string = 'Packing Reg',
  onProgress?: (progress: Partial<SyncProgressInfo>) => void
): Promise<AppendPackingOrdersResult> {
  const totalInput = rows.length;

  onProgress?.({
    isActive: true,
    title: 'Menyimpan Hasil Scan Packing',
    currentStage: 'Menghubungkan ke Google Sheets...',
    stageIndex: 1,
    totalStages: 5,
    percent: 15,
    totalItems: totalInput,
    processedItems: 0,
    newItemsAdded: 0,
    duplicateItemsSkipped: 0,
    sheetTab,
    status: 'preparing',
    detailMessage: 'Memeriksa struktur tab dan metadata spreadsheet...',
  });

  const details = await getSpreadsheetDetails(accessToken, spreadsheetId);
  let targetSheet = details.sheets.find(
    (s) => s.title.trim().toLowerCase() === sheetTab.trim().toLowerCase()
  )?.title;

  if (!targetSheet) {
    targetSheet = details.sheets.find(
      (s) =>
        s.title.toLowerCase().includes('packing reg') ||
        s.title.toLowerCase().includes('packing') ||
        s.title.toLowerCase().includes('paket')
    )?.title;
  }

  // If no packing sheet tab exists, let's create one with the designated title
  if (!targetSheet) {
    try {
      await addSheetTab(accessToken, spreadsheetId, sheetTab, [
        'No',
        'No Pesanan',
        'Platform',
        'Tanggal',
        'Waktu Scan',
        'Status',
      ]);
      targetSheet = sheetTab;
    } catch {
      targetSheet = details.sheets[0]?.title || sheetTab;
    }
  }

  onProgress?.({
    currentStage: `Membaca data lembar "${targetSheet}"...`,
    stageIndex: 2,
    percent: 35,
    sheetTab: targetSheet,
    status: 'reading',
    detailMessage: 'Memuat data yang ada untuk mendeteksi nomor pesanan duplikat...',
  });

  // Read existing rows to check for duplicate order numbers and calculate sequential numbering
  let existingValues: any[][] = [];
  try {
    existingValues = await fetchSheetValues(accessToken, spreadsheetId, `'${targetSheet}'!A1:Z5000`);
  } catch (e: any) {
    if (isAuthExpiredError(e)) throw e;
    console.warn('Could not read existing sheet rows for duplicate check:', e);
  }

  onProgress?.({
    currentStage: 'Memeriksa duplikasi & menyusun nomor urut...',
    stageIndex: 3,
    percent: 50,
    status: 'validating',
    detailMessage: 'Membandingkan data scan dengan riwayat pesanan yang sudah ada...',
  });

  const existingOrderSet = new Set<string>();
  let existingDataRowsCount = 0;

  if (existingValues && existingValues.length > 0) {
    let orderColIndex = 1;
    let hasHeader = false;
    if (existingValues[0]) {
      const headerCells = existingValues[0].map((c: any) => String(c || '').toLowerCase());
      const found = headerCells.findIndex((h: string) =>
        h.includes('pesanan') || h.includes('resi') || h.includes('order') || h.includes('barcode')
      );
      if (found !== -1) {
        orderColIndex = found;
        hasHeader = true;
      } else if (
        headerCells.some((c: string) => c === 'no' || c === 'platform' || c === 'tanggal' || c === 'status')
      ) {
        hasHeader = true;
      }
    }

    const startIndex = hasHeader ? 1 : 0;
    for (let i = startIndex; i < existingValues.length; i++) {
      const r = existingValues[i];
      if (!r || r.length === 0 || !r.some((cell: any) => cell && String(cell).trim() !== '')) {
        continue;
      }
      existingDataRowsCount++;
      const val1 = String(r[orderColIndex] ?? '').trim().toUpperCase();
      const val2 = String(r[1] ?? '').trim().toUpperCase();
      if (val1) existingOrderSet.add(val1);
      if (val2) existingOrderSet.add(val2);
    }
  }

  // Filter incoming rows against existing orders in sheet
  const rowsToAppend: (string | number)[][] = [];
  const skippedOrders: string[] = [];
  const batchSeen = new Set<string>();

  for (const row of rows) {
    // Standard format: [No, orderNumber, platform, date, timestamp, status]
    const orderNo = String(row[1] || '').trim().toUpperCase();
    if (!orderNo) continue;

    if (existingOrderSet.has(orderNo) || batchSeen.has(orderNo)) {
      skippedOrders.push(orderNo);
    } else {
      batchSeen.add(orderNo);
      const rowData = [...row];
      // Sequential numbering continuing from existing rows
      rowData[0] = existingDataRowsCount + rowsToAppend.length + 1;
      rowsToAppend.push(rowData);
    }
  }

  onProgress?.({
    currentStage: 'Menyiapkan batch pengunggahan...',
    stageIndex: 4,
    percent: 55,
    newItemsAdded: rowsToAppend.length,
    duplicateItemsSkipped: skippedOrders.length,
    status: 'uploading',
    detailMessage: `${rowsToAppend.length} data baru valid (${skippedOrders.length} duplikat dilewati)`,
  });

  // Only append if there are new non-duplicate rows
  if (rowsToAppend.length > 0) {
    const CHUNK_SIZE = 50;
    const totalChunks = Math.ceil(rowsToAppend.length / CHUNK_SIZE);

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const start = chunkIdx * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, rowsToAppend.length);
      const chunkRows = rowsToAppend.slice(start, end);

      const chunkPercent = Math.round(55 + ((chunkIdx + 1) / totalChunks) * 35);

      onProgress?.({
        currentStage: `Mengunggah batch ${chunkIdx + 1} dari ${totalChunks}...`,
        stageIndex: 4,
        percent: chunkPercent,
        currentBatch: chunkIdx + 1,
        totalBatches: totalChunks,
        processedItems: end,
        newItemsAdded: rowsToAppend.length,
        duplicateItemsSkipped: skippedOrders.length,
        status: 'uploading',
        detailMessage: `Mengunggah baris ${start + 1}-${end} dari ${rowsToAppend.length} data baru...`,
      });

      const range = `${encodeURIComponent(targetSheet)}!A1`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: chunkRows,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gagal menyimpan data packing ke Google Sheet (${sheetTab}): ${res.status} - ${err}`);
      }
    }
  }

  onProgress?.({
    currentStage: 'Sinkronisasi Selesai & Terverifikasi!',
    stageIndex: 5,
    percent: 100,
    newItemsAdded: rowsToAppend.length,
    duplicateItemsSkipped: skippedOrders.length,
    processedItems: rowsToAppend.length,
    status: 'success',
    detailMessage: `Sukses menyimpan ${rowsToAppend.length} baris ke sheet "${targetSheet}"!`,
  });

  return {
    added: rowsToAppend.length,
    skippedDuplicates: skippedOrders.length,
    skippedOrders,
    targetSheet,
  };
}

/**
 * Helper to add a new tab to existing spreadsheet
 */
export async function addSheetTab(
  accessToken: string,
  spreadsheetId: string,
  title: string,
  headerRow?: string[]
): Promise<void> {
  const requests: any[] = [
    {
      addSheet: {
        properties: {
          title,
        },
      },
    },
  ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gagal menambah sheet baru: ${err}`);
  }

  if (headerRow && headerRow.length > 0) {
    const range = `${encodeURIComponent(title)}!A1`;
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [headerRow] }),
      }
    );
  }
}

/**
 * Fetch rows from a specific spreadsheet sheet tab
 */
export async function fetchSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string = 'A1:Z100'
): Promise<any[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    range
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gagal membaca data dari Google Sheet: ${res.status} - ${err}`);
  }

  const data = await res.json();
  return data.values || [];
}

/**
 * Specifically fetch Packing Reg history from the designated spreadsheet and tab
 */
export async function fetchPackingRegHistory(
  accessToken: string,
  spreadsheetId: string,
  targetTabName: string = 'Packing Reg'
): Promise<{ tabName: string; rows: string[][]; headers: string[] }> {
  try {
    // Attempt 1: Fetch directly with targetTabName
    const range = `'${targetTabName}'!A1:Z2000`;
    const values = await fetchSheetValues(accessToken, spreadsheetId, range);
    if (values && values.length > 0) {
      const headers = (values[0] || []).map((h: any) => String(h || ''));
      const rows = values.slice(1).map((r: any[]) => r.map((c) => String(c ?? '')));
      return { tabName: targetTabName, headers, rows };
    }
  } catch (err: any) {
    if (isAuthExpiredError(err)) {
      throw err;
    }
    // If direct fetch fails, lookup the sheet list to find a matching tab
    console.warn(`Direct fetch of ${targetTabName} failed, attempting tab resolution:`, err);
  }

  const details = await getSpreadsheetDetails(accessToken, spreadsheetId);
  const matchedTab =
    details.sheets.find(
      (s) => s.title.trim().toLowerCase() === targetTabName.trim().toLowerCase()
    )?.title ||
    details.sheets.find(
      (s) =>
        s.title.toLowerCase().includes('packing reg') ||
        s.title.toLowerCase().includes('packing') ||
        s.title.toLowerCase().includes('paket')
    )?.title ||
    details.sheets[0]?.title ||
    targetTabName;

  const range = `'${matchedTab}'!A1:Z2000`;
  const values = await fetchSheetValues(accessToken, spreadsheetId, range);

  const headers = values.length > 0 ? values[0].map((h: any) => String(h || '')) : [];
  const rows = values.length > 1 ? values.slice(1).map((r: any[]) => r.map((c) => String(c ?? ''))) : [];

  return { tabName: matchedTab, headers, rows };
}

/**
 * Specifically fetch Processed Notas history from the designated spreadsheet and tab
 */
export async function fetchProcessedNotasHistory(
  accessToken: string,
  spreadsheetId: string,
  targetTabName: string = 'Nota Diproses'
): Promise<{ tabName: string; rows: string[][]; headers: string[] }> {
  try {
    // Attempt 1: Fetch directly with targetTabName
    const range = `'${targetTabName}'!A1:Z5000`;
    const values = await fetchSheetValues(accessToken, spreadsheetId, range);
    if (values && values.length > 0) {
      const headers = (values[0] || []).map((h: any) => String(h || ''));
      const rows = values.slice(1).map((r: any[]) => r.map((c) => String(c ?? '')));
      return { tabName: targetTabName, headers, rows };
    }
  } catch (err: any) {
    if (isAuthExpiredError(err)) {
      throw err;
    }
    console.warn(`Direct fetch of ${targetTabName} failed, attempting tab resolution:`, err);
  }

  const details = await getSpreadsheetDetails(accessToken, spreadsheetId);
  const matchedTab =
    details.sheets.find(
      (s) => s.title.trim().toLowerCase() === targetTabName.trim().toLowerCase()
    )?.title ||
    details.sheets.find(
      (s) =>
        s.title.toLowerCase().includes('nota diproses') ||
        s.title.toLowerCase().includes('nota') ||
        s.title.toLowerCase().includes('diproses')
    )?.title ||
    details.sheets[0]?.title ||
    targetTabName;

  const range = `'${matchedTab}'!A1:Z5000`;
  const values = await fetchSheetValues(accessToken, spreadsheetId, range);

  const headers = values.length > 0 ? values[0].map((h: any) => String(h || '')) : [];
  const rows = values.length > 1 ? values.slice(1).map((r: any[]) => r.map((c) => String(c ?? ''))) : [];

  return { tabName: matchedTab, headers, rows };
}

export interface CrossReferencedNotasResult {
  notaTabName: string;
  packingTabName: string;
  notaHeaders: string[];
  notaRows: string[][];
  packingHeaders: string[];
  packingRows: string[][];
  packingMap: Map<string, PackingRegRecord>;
  totalPackingCount: number;
}

/**
 * Simultaneously fetch both 'Nota Diproses' (unpacked/admin notas) and 'Packing Reg' (packed orders)
 * and build a normalized lookup map to cross-reference packed orders seamlessly.
 */
export async function fetchCrossReferencedNotasAndPacking(
  accessToken: string,
  spreadsheetId: string,
  targetNotaTab: string = 'Nota Diproses',
  targetPackingTab: string = 'Packing Reg'
): Promise<CrossReferencedNotasResult> {
  const [notaResult, packingResult] = await Promise.allSettled([
    fetchProcessedNotasHistory(accessToken, spreadsheetId, targetNotaTab),
    fetchPackingRegHistory(accessToken, spreadsheetId, targetPackingTab),
  ]);

  const notaData =
    notaResult.status === 'fulfilled'
      ? notaResult.value
      : { tabName: targetNotaTab, headers: [], rows: [] };

  const packingData =
    packingResult.status === 'fulfilled'
      ? packingResult.value
      : { tabName: targetPackingTab, headers: [], rows: [] };

  if (notaResult.status === 'rejected' && isAuthExpiredError(notaResult.reason)) {
    throw notaResult.reason;
  }
  if (packingResult.status === 'rejected' && isAuthExpiredError(packingResult.reason)) {
    throw packingResult.reason;
  }

  // Build packingMap from packingData
  const packingMap = new Map<string, PackingRegRecord>();

  let colOrder = 1;
  let colPlatform = 2;
  let colDate = 3;
  let colTime = 4;
  let colStatus = 5;

  if (packingData.headers && packingData.headers.length > 0) {
    packingData.headers.forEach((h, idx) => {
      const lower = h.trim().toLowerCase();
      if (
        lower.includes('pesanan') ||
        lower.includes('resi') ||
        lower.includes('order') ||
        lower.includes('nota') ||
        lower.includes('barcode')
      ) {
        colOrder = idx;
      } else if (
        lower.includes('platform') ||
        lower.includes('ekspedisi') ||
        lower.includes('marketplace')
      ) {
        colPlatform = idx;
      } else if (
        lower.includes('tanggal') ||
        lower.includes('tgl') ||
        lower.includes('date')
      ) {
        colDate = idx;
      } else if (
        lower.includes('waktu') ||
        lower.includes('jam') ||
        lower.includes('time') ||
        lower.includes('scan')
      ) {
        colTime = idx;
      } else if (
        lower.includes('status') ||
        lower.includes('kondisi')
      ) {
        colStatus = idx;
      }
    });
  }

  packingData.rows.forEach((r) => {
    if (!r || r.length === 0 || !r.some((c) => c && c.trim() !== '')) return;

    const orderNumber = (r[colOrder] ?? r[1] ?? '').trim();
    const platform = (r[colPlatform] ?? r[2] ?? '').trim();
    const date = (r[colDate] ?? r[3] ?? '-').trim();
    const timestamp = (r[colTime] ?? r[4] ?? '-').trim();
    const status = (r[colStatus] ?? r[5] ?? 'Selesai Packing').trim();

    const record: PackingRegRecord = {
      orderNumber: orderNumber || 'PACKED',
      platform,
      date,
      timestamp,
      status,
      rawRow: r,
    };

    if (orderNumber) {
      const exactUpper = orderNumber.toUpperCase();
      const normalized = normalizeOrderNumber(orderNumber);

      packingMap.set(exactUpper, record);
      if (normalized) {
        packingMap.set(normalized, record);
      }
    }

    // Also index any cell in the row that could be an order number, resi, or barcode
    r.forEach((cell) => {
      const val = (cell || '').trim();
      if (val && val.length >= 5 && !val.includes(' ') && !/^(drop|pickup|selesai|packing|beres|spx|jne|jnt|idx|ninja)$/i.test(val)) {
        const u = val.toUpperCase();
        const n = normalizeOrderNumber(val);
        if (!packingMap.has(u)) packingMap.set(u, record);
        if (n && !packingMap.has(n)) packingMap.set(n, record);
      }
    });
  });

  return {
    notaTabName: notaData.tabName,
    packingTabName: packingData.tabName,
    notaHeaders: notaData.headers,
    notaRows: notaData.rows,
    packingHeaders: packingData.headers,
    packingRows: packingData.rows,
    packingMap,
    totalPackingCount: packingData.rows.filter(
      (r) => r && r.some((c) => c && c.trim() !== '')
    ).length,
  };
}

export interface AppendProcessedNotasResult {
  added: number;
  skippedDuplicates: number;
  skippedOrders: string[];
  targetSheet: string;
}

/**
 * Append multiple rows of processed notes to Google Sheet (tab "Nota Diproses")
 * Automatically prevents duplicate notes from being added twice.
 * Supports batch chunking with real-time onProgress visualization.
 */
export async function appendProcessedNotas(
  accessToken: string,
  spreadsheetId: string,
  rows: (string | number)[][],
  sheetTab: string = 'Nota Diproses',
  onProgress?: (progress: Partial<SyncProgressInfo>) => void
): Promise<AppendProcessedNotasResult> {
  const totalInput = rows.length;

  onProgress?.({
    isActive: true,
    title: 'Menyimpan Data Nota Diproses',
    currentStage: 'Menghubungkan ke Google Sheets...',
    stageIndex: 1,
    totalStages: 5,
    percent: 15,
    totalItems: totalInput,
    processedItems: 0,
    newItemsAdded: 0,
    duplicateItemsSkipped: 0,
    sheetTab,
    status: 'preparing',
    detailMessage: 'Memeriksa struktur tab dan metadata spreadsheet...',
  });

  const details = await getSpreadsheetDetails(accessToken, spreadsheetId);
  let targetSheet = details.sheets.find(
    (s) => s.title.trim().toLowerCase() === sheetTab.trim().toLowerCase()
  )?.title;

  if (!targetSheet) {
    try {
      await addSheetTab(accessToken, spreadsheetId, sheetTab, [
        'No',
        'No Nota / Pesanan',
        'Platform',
        'Tanggal Admin',
        'Waktu Admin',
        'Status Packing',
        'Waktu Packing',
        'Catatan',
      ]);
      targetSheet = sheetTab;
    } catch {
      targetSheet = details.sheets[0]?.title || sheetTab;
    }
  }

  onProgress?.({
    currentStage: `Membaca data lembar "${targetSheet}"...`,
    stageIndex: 2,
    percent: 35,
    sheetTab: targetSheet,
    status: 'reading',
    detailMessage: 'Memuat data nota yang ada untuk validasi anti-duplikasi...',
  });

  // Read existing rows to check for duplicate order numbers and calculate sequential numbering
  let existingValues: any[][] = [];
  try {
    existingValues = await fetchSheetValues(accessToken, spreadsheetId, `'${targetSheet}'!A1:Z5000`);
  } catch (e: any) {
    if (isAuthExpiredError(e)) throw e;
    console.warn('Could not read existing sheet rows for duplicate check:', e);
  }

  onProgress?.({
    currentStage: 'Memeriksa duplikasi nota & menyusun nomor urut...',
    stageIndex: 3,
    percent: 50,
    status: 'validating',
    detailMessage: 'Memeriksa nomor nota yang sudah tercatat di Google Sheet...',
  });

  const existingOrderSet = new Set<string>();
  let existingDataRowsCount = 0;

  if (existingValues && existingValues.length > 0) {
    let orderColIndex = 1;
    let hasHeader = false;
    if (existingValues[0]) {
      const headerCells = existingValues[0].map((c: any) => String(c || '').toLowerCase());
      const found = headerCells.findIndex((h: string) =>
        h.includes('nota') || h.includes('pesanan') || h.includes('resi') || h.includes('order')
      );
      if (found !== -1) {
        orderColIndex = found;
        hasHeader = true;
      } else if (
        headerCells.some((c: string) => c === 'no' || c === 'platform' || c === 'tanggal')
      ) {
        hasHeader = true;
      }
    }

    const startIndex = hasHeader ? 1 : 0;
    for (let i = startIndex; i < existingValues.length; i++) {
      const r = existingValues[i];
      if (!r || r.length === 0 || !r.some((cell: any) => cell && String(cell).trim() !== '')) {
        continue;
      }
      existingDataRowsCount++;
      const val1 = String(r[orderColIndex] ?? '').trim().toUpperCase();
      const val2 = String(r[1] ?? '').trim().toUpperCase();
      if (val1) existingOrderSet.add(val1);
      if (val2) existingOrderSet.add(val2);
    }
  }

  // Filter incoming rows against existing orders in sheet
  const rowsToAppend: (string | number)[][] = [];
  const skippedOrders: string[] = [];
  const batchSeen = new Set<string>();

  for (const row of rows) {
    const orderNo = String(row[1] || '').trim().toUpperCase();
    if (!orderNo) continue;

    if (existingOrderSet.has(orderNo) || batchSeen.has(orderNo)) {
      skippedOrders.push(orderNo);
    } else {
      batchSeen.add(orderNo);
      const rowData = [...row];
      rowData[0] = existingDataRowsCount + rowsToAppend.length + 1;
      rowsToAppend.push(rowData);
    }
  }

  onProgress?.({
    currentStage: 'Menyiapkan batch pengunggahan...',
    stageIndex: 4,
    percent: 55,
    newItemsAdded: rowsToAppend.length,
    duplicateItemsSkipped: skippedOrders.length,
    status: 'uploading',
    detailMessage: `${rowsToAppend.length} nota baru valid (${skippedOrders.length} duplikat dilewati)`,
  });

  if (rowsToAppend.length > 0) {
    const CHUNK_SIZE = 50;
    const totalChunks = Math.ceil(rowsToAppend.length / CHUNK_SIZE);

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const start = chunkIdx * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, rowsToAppend.length);
      const chunkRows = rowsToAppend.slice(start, end);

      const chunkPercent = Math.round(55 + ((chunkIdx + 1) / totalChunks) * 35);

      onProgress?.({
        currentStage: `Mengunggah batch ${chunkIdx + 1} dari ${totalChunks}...`,
        stageIndex: 4,
        percent: chunkPercent,
        currentBatch: chunkIdx + 1,
        totalBatches: totalChunks,
        processedItems: end,
        newItemsAdded: rowsToAppend.length,
        duplicateItemsSkipped: skippedOrders.length,
        status: 'uploading',
        detailMessage: `Mengunggah baris ${start + 1}-${end} dari ${rowsToAppend.length} nota...`,
      });

      const range = `${encodeURIComponent(targetSheet)}!A1`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: chunkRows,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gagal menyimpan data nota ke Google Sheet (${sheetTab}): ${res.status} - ${err}`);
      }
    }
  }

  onProgress?.({
    currentStage: 'Sinkronisasi Nota Selesai & Terverifikasi!',
    stageIndex: 5,
    percent: 100,
    newItemsAdded: rowsToAppend.length,
    duplicateItemsSkipped: skippedOrders.length,
    processedItems: rowsToAppend.length,
    status: 'success',
    detailMessage: `Sukses menyimpan ${rowsToAppend.length} nota ke sheet "${targetSheet}"!`,
  });

  return {
    added: rowsToAppend.length,
    skippedDuplicates: skippedOrders.length,
    skippedOrders,
    targetSheet,
  };
}

/**
 * Mark orders as packed in Google Sheets:
 * 1. Appends packing scan entries to the packing sheet tab (e.g. "Packing Reg")
 * 2. Updates the Status Packing (Col F) & Waktu Packing (Col G) in the Nota Diproses tab if rowNumber is known
 */
export async function markOrdersAsPackedInSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  orders: { orderNumber: string; platform: PlatformType; rowNumber?: number; adminDate?: string }[],
  packingTab: string = 'Packing Reg',
  notaTab: string = 'Nota Diproses'
): Promise<{ addedToPacking: number; updatedInNota: number }> {
  if (!orders || orders.length === 0) {
    return { addedToPacking: 0, updatedInNota: 0 };
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).replace(/\//g, '/');
  const timeStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // 1. Append to Packing sheet tab
  const packingRows = orders.map((o, idx) => [
    idx + 1,
    o.orderNumber,
    o.platform,
    o.adminDate || dateStr,
    timeStr,
    'Selesai Packing',
  ]);

  let addedToPacking = 0;
  try {
    const res = await appendPackingOrders(accessToken, spreadsheetId, packingRows, packingTab);
    addedToPacking = res.added;
  } catch (err) {
    console.warn('Could not append to packing tab:', err);
  }

  // 2. Batch update Status in Nota tab if rowNumber is known
  let updatedInNota = 0;
  const rowsToUpdate = orders.filter((o) => o.rowNumber && o.rowNumber > 1);
  if (rowsToUpdate.length > 0) {
    try {
      const dataPayload = rowsToUpdate.map((o) => ({
        range: `'${notaTab}'!F${o.rowNumber}:G${o.rowNumber}`,
        values: [['Selesai Packing', timeStr]],
      }));

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
      const updateRes = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: dataPayload,
        }),
      });

      if (updateRes.ok) {
        updatedInNota = rowsToUpdate.length;
      } else {
        console.warn('Failed batch updating nota status:', await updateRes.text());
      }
    } catch (err) {
      console.warn('Could not update status in Nota Diproses tab:', err);
    }
  }

  return { addedToPacking, updatedInNota };
}


