import { XMLParser } from 'fast-xml-parser';
import * as XLSX_PKG from 'xlsx';
import JSZip from 'jszip';
import { SchemaMapping, ProcessingResult } from '../types';

// --- Library Compatibility Fix ---
// Handle the case where the CDN ESM wrapper puts the library on the 'default' property
const XLSX = (XLSX_PKG as any).default || XLSX_PKG;

// --- Constants & Types ---

interface SageEntry {
  type: 'Sent' | 'Received' | string;
  event: 'RWT' | 'RMT' | string;
  date: Date;
  source: string;
  details: string;
  originalSource: string;
}

// Mappings based on user screenshot goals
const SOURCE_MAP: Record<string, string> = {
  'Monitor 1': 'KBOI 670AM LP2+PEP Monitor 1',
  'Monitor 2': 'KBSU 90.3FM LP1 Monitor 2',
  'Monitor 3': 'WXK68 162.55 NWS Monitor 3',
  'CAP': 'CAP-IPAWS',
  'Station': 'Station Log'
};

// --- Styling Constants ---
const STYLES = {
  header: {
    font: { bold: true, sz: 11, color: { rgb: "000000" } },
    fill: { fgColor: { rgb: "E0E0E0" } },
    border: { bottom: { style: "thin", color: { rgb: "000000" } } },
    alignment: { horizontal: "left", vertical: "center" }
  },
  title: {
    font: { bold: true, sz: 14 },
    alignment: { horizontal: "left" }
  },
  cell: {
    font: { sz: 10 },
    alignment: { vertical: "top", wrapText: true }
  },
  cellCenter: {
    font: { sz: 10 },
    alignment: { vertical: "center", horizontal: "center", wrapText: true }
  },
  missing: {
    font: { bold: true, color: { rgb: "9C0006" } }, // Dark Red text
    fill: { fgColor: { rgb: "FFC7CE" } }, // Light Red fill
    alignment: { vertical: "center", horizontal: "center" },
    border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
  },
  success: {
    font: { color: { rgb: "006100" } }, // Dark Green text
    fill: { fgColor: { rgb: "C6EFCE" } }, // Light Green fill
    alignment: { vertical: "center", horizontal: "center", wrapText: true }
  },
  warning: {
    fill: { fgColor: { rgb: "FFEB9C" } }, // Yellow fill
    alignment: { vertical: "center", horizontal: "center", wrapText: true }
  },
  borderBottom: {
    border: { bottom: { style: "thin", color: { rgb: "000000" } } }
  }
};

// --- Date Helpers ---

const parseSageDate = (dateStr: string): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  try {
    const [datePart, timePart] = dateStr.split(' ');
    if (!datePart) return null;

    const dateSegments = datePart.split('/');
    if (dateSegments.length !== 3) return null;

    const month = dateSegments[0].padStart(2, '0');
    const day = dateSegments[1].padStart(2, '0');
    let year = dateSegments[2];
    if (year.length === 2) year = '20' + year;

    const isoString = `${year}-${month}-${day}T${timePart || '00:00:00'}`;
    const dateObj = new Date(isoString);
    return isNaN(dateObj.getTime()) ? null : dateObj;
  } catch (e) {
    return null;
  }
};

const getWeekStartDate = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay(); // 0 is Sunday
  const diff = d.getDate() - day; // Adjust to Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatDateShort = (d: Date): string => {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};

const formatTime = (d: Date): string => {
  return d.toTimeString().split(' ')[0]; // HH:mm:ss
};

const formatWeekRange = (sunday: Date): string => {
  const end = new Date(sunday);
  end.setDate(sunday.getDate() + 6);
  return `${(sunday.getMonth() + 1).toString().padStart(2, '0')}/${sunday.getDate().toString().padStart(2, '0')} - ${(end.getMonth() + 1).toString().padStart(2, '0')}/${end.getDate().toString().padStart(2, '0')}`;
};

// --- Sage Processing Logic ---

const parseSageEntry = (row: any): SageEntry | null => {
  const type = row.type || '';
  if (type !== 'Sent' && type !== 'Received') return null;

  const details = row.details || '';
  const zczc = row.zczc || '';
  
  // Determine Event
  let event = '';
  if (zczc.includes('-RWT-') || details.includes('Required Weekly Test')) event = 'RWT';
  else if (zczc.includes('-RMT-') || details.includes('Required Monthly Test')) event = 'RMT';
  
  if (!event) return null; // We only care about RWT and RMT

  const dateObj = parseSageDate(row.date);
  if (!dateObj) return null;

  // Clean Source
  let source = 'Unknown';
  let originalSource = 'Unknown';

  if (details.includes('Received from CAP')) {
    source = SOURCE_MAP['CAP'];
    originalSource = 'CAP';
    if (details.includes('IPAWS')) source = 'CAP-IPAWS IPAWS@DHS.GOV';
  } else if (details.includes('Received on Monitor')) {
    const match = details.match(/Received on Monitor (\d+)/);
    if (match) {
      const monNum = match[1];
      source = SOURCE_MAP[`Monitor ${monNum}`] || `Monitor ${monNum}`;
      originalSource = `Monitor ${monNum}`;
    }
  } else if (type === 'Sent') {
    source = 'Station Log';
    originalSource = 'Station';
  }

  return {
    type,
    event,
    date: dateObj,
    source,
    details: details.replace(/\s+/g, ' ').trim(),
    originalSource
  };
};

// --- Helper: Calculate RMT "Within 1 Hour" ---
const checkRmtCompliance = (sentEntry: SageEntry, receivedEntries: SageEntry[]): { compliant: boolean, found: boolean } => {
  // Filter for Received RMTs that happened BEFORE the sent time
  const eligible = receivedEntries.filter(r => r.date.getTime() < sentEntry.date.getTime());
  
  if (eligible.length === 0) return { compliant: false, found: false };

  // Sort by date descending (closest to sent time first)
  eligible.sort((a, b) => b.date.getTime() - a.date.getTime());
  const latestReceived = eligible[0];

  const diffMs = sentEntry.date.getTime() - latestReceived.date.getTime();
  const diffMins = diffMs / (1000 * 60);

  return {
    compliant: diffMins <= 60,
    found: true
  };
};

// --- Excel Generation ---

// Helper to safely add styled cell
const addCell = (ws: XLSX_PKG.WorkSheet, row: number, col: number, val: any, style: any) => {
  const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = { v: val, s: style };
  if(val === null || val === undefined) cell.v = "";
  ws[cellRef] = cell;
};

const generateMonthSheet = (entries: SageEntry[], year: string, month: string): XLSX_PKG.WorkSheet => {
  const ws: XLSX_PKG.WorkSheet = {};
  let currentRow = 0;
  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long' });
  
  // Define columns width
  ws['!cols'] = [
    { wch: 35 }, // A: Source / Description
    { wch: 18 }, // B: Date
    { wch: 18 }, // C: Time
    { wch: 15 }, // D: Compliance / Notes
    { wch: 30 }, // E: Signatures
    { wch: 15 }, // F
    { wch: 15 }  // G
  ];

  // 1. Title Header
  addCell(ws, currentRow, 0, "Emergency Alert System Log", STYLES.title);
  addCell(ws, currentRow, 3, "Station:", STYLES.cell);
  currentRow++;
  addCell(ws, currentRow, 3, `Month/Year: ${monthName} ${year}`, { font: { bold: true } });
  currentRow += 2;

  // 2. RMT Received Section
  addCell(ws, currentRow, 0, "Required Monthly Test (RMT) Received", STYLES.header);
  currentRow++;
  
  const rmtReceivedHeader = ["Received From", "Date", "Time", "", "Signature or Notes"];
  rmtReceivedHeader.forEach((h, i) => addCell(ws, currentRow, i, h, STYLES.header));
  currentRow++;

  const rmtReceived = entries.filter(e => e.event === 'RMT' && e.type === 'Received').sort((a,b) => a.date.getTime() - b.date.getTime());
  
  if (rmtReceived.length === 0) {
    addCell(ws, currentRow, 0, "(No RMT Received)", STYLES.cell);
    currentRow++;
  } else {
    rmtReceived.forEach(e => {
      addCell(ws, currentRow, 0, e.source, STYLES.cell);
      addCell(ws, currentRow, 1, formatDateShort(e.date), STYLES.cellCenter);
      addCell(ws, currentRow, 2, formatTime(e.date), STYLES.cellCenter);
      addCell(ws, currentRow, 4, "CRW", STYLES.cell);
      currentRow++;
    });
  }
  addCell(ws, currentRow, 0, "Explanation for RMT not received:", STYLES.cell);
  currentRow += 2;

  // 3. RMT Transmitted Section
  addCell(ws, currentRow, 0, "Required Monthly Test (RMT) Transmitted", STYLES.header);
  currentRow++;
  const rmtSentHeader = ["Date", "Time Sent", "Within 1 Hour? Y/N", "", "Signature or Notes"];
  rmtSentHeader.forEach((h, i) => addCell(ws, currentRow, i, h, STYLES.header));
  currentRow++;

  const rmtSent = entries.filter(e => e.event === 'RMT' && e.type === 'Sent').sort((a,b) => a.date.getTime() - b.date.getTime());

  if (rmtSent.length === 0) {
    addCell(ws, currentRow, 0, "(No RMT Sent)", STYLES.cell);
    currentRow++;
  } else {
    rmtSent.forEach(e => {
      // Calculate compliance
      const compliance = checkRmtCompliance(e, rmtReceived);
      const complianceText = compliance.found ? (compliance.compliant ? "Y" : "N (Over 1hr)") : "N (No RX)";
      const complianceStyle = compliance.compliant ? STYLES.success : STYLES.missing;

      addCell(ws, currentRow, 0, formatDateShort(e.date), STYLES.cellCenter);
      addCell(ws, currentRow, 1, formatTime(e.date), STYLES.cellCenter);
      addCell(ws, currentRow, 2, complianceText, compliance.found && compliance.compliant ? STYLES.success : (compliance.found ? STYLES.missing : STYLES.warning));
      addCell(ws, currentRow, 4, "CRW", STYLES.cell);
      currentRow++;
    });
  }
  addCell(ws, currentRow, 0, "Explanation for RMT not transmitted:", STYLES.cell);
  currentRow += 2;

  // 4. RWT Received Section (Matrix)
  addCell(ws, currentRow, 0, "Required Weekly Test (RWT) Received", STYLES.header);
  currentRow++;

  // Calculate Weeks
  const weeks = new Set<number>();
  entries.forEach(e => weeks.add(getWeekStartDate(e.date).getTime()));
  const sortedWeeks = Array.from(weeks).sort((a, b) => a - b).map(t => new Date(t));

  // Header Row for Matrix
  addCell(ws, currentRow, 0, "LP or NWS", STYLES.header);
  sortedWeeks.forEach((w, i) => {
    addCell(ws, currentRow, i + 1, `WEEK OF\n${formatWeekRange(w)}`, STYLES.header);
  });
  currentRow++;

  // Determine Unique Sources for RWT Received
  const rwtReceived = entries.filter(e => e.event === 'RWT' && e.type === 'Received');
  const sources = Array.from(new Set(rwtReceived.map(e => e.source))).sort();

  // Build Matrix Rows
  sources.forEach(src => {
    addCell(ws, currentRow, 0, src, STYLES.cell);
    
    sortedWeeks.forEach((weekStart, i) => {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7); // Exclusive end

      // Find entry for this source in this week
      const entry = rwtReceived.find(e => 
        e.source === src && 
        e.date >= weekStart && 
        e.date < weekEnd
      );

      if (entry) {
        const val = `${formatDateShort(entry.date)}\n${formatTime(entry.date)}`;
        addCell(ws, currentRow, i + 1, val, STYLES.cellCenter);
      } else {
        addCell(ws, currentRow, i + 1, "MISSING", STYLES.missing);
      }
    });
    currentRow++;
  });
  
  if (sources.length === 0) {
    addCell(ws, currentRow, 0, "No RWT Received Data", STYLES.cell);
    currentRow++;
  }

  currentRow += 2;

  // 5. RWT Transmitted Section
  addCell(ws, currentRow, 0, "Required Weekly Test (RWT) Transmitted", STYLES.header);
  currentRow++;
  
  const rwtSentHeader = ["WEEK OF", "DATE", "TIME", "SIGNATURE or NOTES"];
  rwtSentHeader.forEach((h, i) => addCell(ws, currentRow, i, h, STYLES.header));
  currentRow++;

  const rwtSent = entries.filter(e => e.event === 'RWT' && e.type === 'Sent').sort((a,b) => a.date.getTime() - b.date.getTime());

  rwtSent.forEach(e => {
    const weekStart = getWeekStartDate(e.date);
    addCell(ws, currentRow, 0, formatWeekRange(weekStart), STYLES.cellCenter);
    addCell(ws, currentRow, 1, formatDateShort(e.date), STYLES.cellCenter);
    addCell(ws, currentRow, 2, formatTime(e.date), STYLES.cellCenter);
    addCell(ws, currentRow, 3, "CRW", STYLES.cell);
    currentRow++;
  });

  addCell(ws, currentRow, 0, "Explanation of RWT Failures:", STYLES.cell);
  currentRow += 2;
  addCell(ws, currentRow, 0, "Other Information:", STYLES.cell);
  currentRow += 3;
  
  // Footer
  addCell(ws, currentRow, 0, "Weekly Log Review by Chief Operator or Designee", STYLES.header);
  currentRow++;
  addCell(ws, currentRow, 0, "WEEK OF", STYLES.header);
  addCell(ws, currentRow, 1, "SIGNATURE", STYLES.header);
  currentRow++;

  sortedWeeks.forEach(w => {
    addCell(ws, currentRow, 0, formatWeekRange(w), STYLES.cellCenter);
    addCell(ws, currentRow, 1, "CRW", STYLES.cell);
    currentRow++;
  });

  // Update range
  const range = { s: { c: 0, r: 0 }, e: { c: sortedWeeks.length + 1, r: currentRow } };
  ws['!ref'] = XLSX.utils.encode_range(range);

  return ws;
};

// --- Main Processing ---

export const processXMLFile = async (
  file: File, 
  mapping: SchemaMapping
): Promise<ProcessingResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const xmlContent = e.target?.result as string;
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "@_",
          isArray: (name) => name === 'entry' // Assume 'entry' is the repeating tag based on provided XML
        });
        const jsonObj = parser.parse(xmlContent);
        
        let rows: any[] = [];
        if (jsonObj.log && jsonObj.log.entry) {
          rows = Array.isArray(jsonObj.log.entry) ? jsonObj.log.entry : [jsonObj.log.entry];
        } else {
           // Fallback recursive search
           const findArray = (obj: any): any[] => {
             for (const key in obj) {
               if (Array.isArray(obj[key])) return obj[key];
               if (typeof obj[key] === 'object') {
                 const res = findArray(obj[key]);
                 if (res.length > 0) return res;
               }
             }
             return [];
           };
           rows = findArray(jsonObj);
        }

        if (!rows || rows.length === 0) throw new Error("No records found.");

        // Parse all valid entries first
        const allEntries: SageEntry[] = [];
        rows.forEach(r => {
          const entry = parseSageEntry(r);
          if (entry) allEntries.push(entry);
        });

        // Group by Month
        const grouped: Record<string, SageEntry[]> = {};
        const monthsFound = new Set<string>();

        allEntries.forEach(entry => {
          const y = entry.date.getFullYear();
          const m = (entry.date.getMonth() + 1).toString().padStart(2, '0');
          const key = `${y}/${m}`;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(entry);
          monthsFound.add(key);
        });

        // Generate ZIP
        const zip = new JSZip();
        let filesCreated = 0;

        for (const [key, entries] of Object.entries(grouped)) {
          const [year, month] = key.split('/');
          
          // Generate the special sheet data
          const ws = generateMonthSheet(entries, year, month);
          
          // Create Workbook
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, `${month}-${year}`);
          
          // Use the write function from the xlsx-js-style library which supports 'cellStyles' option implicitly
          const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          zip.file(`${year}/${month}/Sage_Log_${year}-${month}.xlsx`, buffer);
          filesCreated++;
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });

        resolve({
          zipBlob,
          stats: {
            totalRows: allEntries.length,
            filesCreated,
            monthsFound: Array.from(monthsFound).sort()
          }
        });

      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsText(file);
  });
};
