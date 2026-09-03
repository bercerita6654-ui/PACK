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
  rowData: (string | number)[]
): Promise<void> {
  // Check available sheets first to target the right tab
  const details = await getSpreadsheetDetails(accessToken, spreadsheetId);
  const targetSheet =
    details.sheets.find((s) => s.title.toLowerCase().includes('rekap'))?.title ||
    details.sheets[0]?.title ||
    'Sheet1';

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
}

/**
 * Append multiple rows of scanned packed orders to Google Sheet (e.g. Packing Reg)
 */
export async function appendPackingOrders(
  accessToken: string,
  spreadsheetId: string,
  rows: (string | number)[][],
  sheetTab: string = 'Packing Reg'
): Promise<void> {
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

  const range = `${encodeURIComponent(targetSheet)}!A1`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: rows,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gagal menyimpan data packing ke Google Sheet (${sheetTab}): ${res.status} - ${err}`);
  }
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
  } catch (err) {
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

