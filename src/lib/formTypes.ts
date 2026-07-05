import type { FormFieldType } from './database.types';

export interface FormFieldDefinition {
  id?: string;
  key: string;
  label: string;
  type: FormFieldType;
  options?: string[] | null;
  required: boolean;
  fixed: boolean;
  sort_order: number;
  accept_file_types?: string[] | null;
  max_file_size_mb?: number | null;
}

/** Field wajib default yang selalu ada di setiap event dan tidak bisa dihapus dosen. */
export const FIXED_FIELDS: FormFieldDefinition[] = [
  { key: 'nama_lengkap', label: 'Nama Lengkap', type: 'text', required: true, fixed: true, sort_order: 0 },
  { key: 'no_wa', label: 'No. WhatsApp', type: 'text', required: true, fixed: true, sort_order: 1 },
  { key: 'email', label: 'Email', type: 'text', required: false, fixed: true, sort_order: 2 },
];

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: 'Isian Singkat',
  textarea: 'Isian Panjang',
  select: 'Pilihan (Dropdown)',
  checkbox: 'Pilihan Ganda (Checkbox)',
  file: 'Upload File',
};
