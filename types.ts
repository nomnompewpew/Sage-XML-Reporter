export interface XMLField {
  key: string;
  sampleValue: string | number | null;
  label: string;
}

export interface SchemaMapping {
  rootElement: string; // The list container e.g., <Transactions>
  rowElement: string;  // The individual item e.g., <Transaction>
  dateField: string;   // Key used to split by month
  fieldsToExport: string[]; // Keys to include in Excel
  isSage?: boolean;    // Flag to trigger specialized Sage EAS parsing logic
}

export interface ProcessingStats {
  totalRows: number;
  filesCreated: number;
  monthsFound: string[];
}

export enum AppStep {
  UPLOAD = 'UPLOAD',
  ANALYZE = 'ANALYZE',
  PREVIEW = 'PREVIEW',
  PROCESSING = 'PROCESSING',
  COMPLETE = 'COMPLETE'
}

export interface ParsedRow {
  [key: string]: any;
}

export interface ProcessingResult {
  zipBlob: Blob;
  stats: ProcessingStats;
}