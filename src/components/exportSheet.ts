import { saveBlob } from '@unisim/media/save';
import type { Table } from '../lib/store';
import { useAppStore } from '../stores/appStore';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Save everything — or a selection and what goes with it — as a spreadsheet. */
export function saveSpreadsheet(table?: Table, ids?: string[]) {
  const { bytes, name } = useAppStore.getState().spreadsheet(table, ids);
  void saveBlob(new Blob([bytes as BlobPart], { type: XLSX_TYPE }), name);
}
