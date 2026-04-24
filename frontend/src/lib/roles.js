export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  ceo: 'CEO',
  rm: 'Regional Manager',
  marketing: 'Marketing',
  od: 'Optimisation Department',
  hr: 'Human Resources',
  academy: 'Academy',
  finance: 'Finance',
};

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role;
}

export function getRoleBadgeClass(role) {
  switch (role) {
    case 'super_admin':
    case 'ceo':
      return 'badgeExecutive';
    case 'marketing':
      return 'badgeMarketing';
    case 'academy':
      return 'badgeAcademy';
    case 'rm':
    case 'od':
    case 'finance':
      return 'badgeFinance';
    case 'hr':
      return 'badgeSales';
    default:
      return 'badgeExecutive';
  }
}
