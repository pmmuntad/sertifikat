import { useAuth } from '@/context/AuthContext';
import { Building2, ChevronDown } from 'lucide-react';

/**
 * Ditampilkan di header dashboard. Untuk kasus umum (user hanya member 1
 * organisasi) komponen ini otomatis tersembunyi — user memang otomatis masuk
 * ke organisasinya tanpa perlu memilih apa pun. Dropdown hanya muncul untuk
 * kasus khusus dimana satu user (misal konsultan/admin platform) menjadi
 * member di lebih dari satu lembaga.
 */
export function OrganizationSwitcher() {
  const { organization, memberships, switchOrganization } = useAuth();

  if (memberships.length <= 1) {
    return (
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <Building2 className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 leading-tight">
            {organization?.name ?? '—'}
          </p>
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium capitalize text-indigo-700">
            {organization?.plan}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-w-0">
      <select
        value={organization?.id ?? ''}
        onChange={(e) => switchOrganization(e.target.value)}
        className="w-full max-w-[220px] appearance-none truncate rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      >
        {memberships.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    </div>
  );
}
