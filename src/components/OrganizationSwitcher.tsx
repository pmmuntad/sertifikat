import { useAuth } from '@/context/AuthContext';

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
      <div className="org-badge">
        <strong>{organization?.name ?? '—'}</strong>
        <span className="org-plan-tag">{organization?.plan}</span>
      </div>
    );
  }

  return (
    <select
      className="org-switcher"
      value={organization?.id ?? ''}
      onChange={(e) => switchOrganization(e.target.value)}
    >
      {memberships.map((org) => (
        <option key={org.id} value={org.id}>
          {org.name}
        </option>
      ))}
    </select>
  );
}
