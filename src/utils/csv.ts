import { AppState } from '../types';
import { EXPEDITIONS } from '../data/constants';

export function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) {
        result.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell.trim());
    if (row.some((c) => c.length > 0)) {
      result.push(row);
    }
  }

  return result;
}

export function formatIndonesianDate(date: Date = new Date()): string {
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function generateWhatsAppSummary(appData: AppState): string {
  const total =
    appData.counts.JNE +
    appData.counts.JNT +
    appData.counts.SPX +
    appData.counts.IDX;

  const totalPickup = Math.max(
    0,
    appData.logs
      .filter((l) => (l.method || 'pickup') === 'pickup')
      .reduce((sum, l) => sum + l.amount, 0)
  );

  const totalDropOff = Math.max(
    0,
    appData.logs
      .filter((l) => l.method === 'drop off')
      .reduce((sum, l) => sum + l.amount, 0)
  );

  return `📦 *REKAP KIRIMAN PAKET*
📅 *Tanggal:* ${appData.date}

🔹 *JNE:* ${appData.counts.JNE} paket
🔹 *J&T Express:* ${appData.counts.JNT} paket
🔹 *SPX:* ${appData.counts.SPX} paket
🔹 *ID Xpress:* ${appData.counts.IDX} paket

📊 *TOTAL PAKET:* ${total} paket
🚚 *Pickup:* ${totalPickup} paket | 🏪 *Drop Off:* ${totalDropOff} paket

_Dibuat otomatis dari aplikasi Rekap Kiriman paket_`;
}

export function exportDailyCSV(appData: AppState) {
  const total =
    appData.counts.JNE +
    appData.counts.JNT +
    appData.counts.SPX +
    appData.counts.IDX;

  let csvContent = 'data:text/csv;charset=utf-8,';
  csvContent += `Tanggal,JNE,J&T Express,SPX,ID Xpress,Total\n`;
  csvContent += `"${appData.date}",${appData.counts.JNE},${appData.counts.JNT},${appData.counts.SPX},${appData.counts.IDX},${total}\n\n`;

  csvContent += `Riwayat Log Paket Hari Ini\nWaktu,Ekspedisi,Nama Ekspedisi,Metode,Jumlah\n`;
  appData.logs.forEach((log) => {
    const expName = EXPEDITIONS[log.expedition]?.name || log.expedition;
    const method = log.method || 'pickup';
    const amountStr = log.amount > 0 ? `+${log.amount}` : `${log.amount}`;
    csvContent += `"${log.timestamp}","${log.expedition}","${expName}","${method}",${amountStr}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute(
    'download',
    `rekap-kiriman-paket-${new Date().toISOString().split('T')[0]}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
