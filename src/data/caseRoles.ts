import { CaseCategory, CourtRole } from './types';

export interface CategoryRoleConfig {
  partyARoles: string[];
  partyBRoles: string[];
  ourRoleOptions: { value: string; labelEn: string; labelBn: string; side: 'A' | 'B' }[];
  defaultPartyARole: string;
  defaultPartyBRole: string;
}

export const CATEGORY_ROLES: Record<CaseCategory, CategoryRoleConfig> = {
  civil: {
    partyARoles: ['Plaintiff', 'Petitioner', 'Appellant', 'Applicant', 'Revisioner'],
    partyBRoles: ['Defendant', 'Respondent', 'Opposite Party'],
    ourRoleOptions: [
      { value: 'Plaintiff', labelEn: 'Plaintiff (বাদী)', labelBn: 'বাদী', side: 'A' },
      { value: 'Defendant', labelEn: 'Defendant (বিবাদী)', labelBn: 'বিবাদী', side: 'B' },
      { value: 'Petitioner', labelEn: 'Petitioner (দরখাস্তকারী)', labelBn: 'দরখাস্তকারী', side: 'A' },
      { value: 'Respondent', labelEn: 'Respondent (উত্তরদাতা)', labelBn: 'উত্তরদাতা', side: 'B' },
      { value: 'Appellant', labelEn: 'Appellant (আপিলকারী)', labelBn: 'আপিলকারী', side: 'A' },
      { value: 'Applicant', labelEn: 'Applicant (আবেদনকারী)', labelBn: 'আবেদনকারী', side: 'A' },
      { value: 'Opposite Party', labelEn: 'Opposite Party (বিপক্ষ দল)', labelBn: 'বিপক্ষ দল', side: 'B' },
      { value: 'Revisioner', labelEn: 'Revisioner (রিভিশনকারী)', labelBn: 'রিভিশনকারী', side: 'A' },
    ],
    defaultPartyARole: 'Plaintiff',
    defaultPartyBRole: 'Defendant',
  },
  criminal_gr: {
    partyARoles: ['Prosecution', 'State'],
    partyBRoles: ['Accused'],
    ourRoleOptions: [
      { value: 'Defence counsel', labelEn: 'Defence counsel (আসামিপক্ষীয় আইনজীবী)', labelBn: 'আসামিপক্ষীয় আইনজীবী', side: 'B' },
      { value: 'Prosecution counsel', labelEn: 'Prosecution counsel (রাষ্ট্রপক্ষীয় আইনজীবী)', labelBn: 'রাষ্ট্রপক্ষীয় আইনজীবী', side: 'A' },
    ],
    defaultPartyARole: 'State',
    defaultPartyBRole: 'Accused',
  },
  criminal_cr: {
    partyARoles: ['Complainant'],
    partyBRoles: ['Accused'],
    ourRoleOptions: [
      { value: "Complainant's counsel", labelEn: "Complainant's counsel (ফরিয়াদিপক্ষীয় আইনজীবী)", labelBn: 'ফরিয়াদিপক্ষীয় আইনজীবী', side: 'A' },
      { value: 'Defence counsel', labelEn: 'Defence counsel (আসামিপক্ষীয় আইনজীবী)', labelBn: 'আসামিপক্ষীয় আইনজীবী', side: 'B' },
    ],
    defaultPartyARole: 'Complainant',
    defaultPartyBRole: 'Accused',
  },
  other: {
    partyARoles: ['Petitioner', 'Applicant', 'First Party', 'Plaintiff', 'State'],
    partyBRoles: ['Respondent', 'Opposite Party', 'Second Party', 'Defendant', 'Accused'],
    ourRoleOptions: [
      { value: 'Petitioner', labelEn: 'Petitioner (দরখাস্তকারী)', labelBn: 'দরখাস্তকারী', side: 'A' },
      { value: 'Respondent', labelEn: 'Respondent (উত্তরদাতা)', labelBn: 'উত্তরদাতা', side: 'B' },
      { value: 'Applicant', labelEn: 'Applicant (আবেদনকারী)', labelBn: 'আবেদনকারী', side: 'A' },
      { value: 'Opposite Party', labelEn: 'Opposite Party (বিপক্ষ দল)', labelBn: 'বিপক্ষ দল', side: 'B' },
      { value: 'First Party', labelEn: '1st Party (১ম পক্ষ)', labelBn: '১ম পক্ষ', side: 'A' },
      { value: 'Second Party', labelEn: '2nd Party (২য় পক্ষ)', labelBn: '২য় পক্ষ', side: 'B' },
    ],
    defaultPartyARole: 'First Party',
    defaultPartyBRole: 'Second Party',
  },
};

export function validateCaseRoles(
  category: CaseCategory = 'civil',
  ourRole?: string | null,
  partyARole?: string | null,
  partyBRole?: string | null
): { valid: boolean; error?: string } {
  if (category === 'criminal_gr') {
    const validOurRoles = ['Prosecution counsel', 'Defence counsel'];
    if (ourRole && !validOurRoles.includes(ourRole)) {
      return {
        valid: false,
        error: `Invalid ourRole '${ourRole}' for Criminal GR. Allowed roles: ${validOurRoles.join(', ')}`,
      };
    }
    const validPartyARoles = ['Prosecution', 'State'];
    if (partyARole && !validPartyARoles.includes(partyARole)) {
      return {
        valid: false,
        error: `Invalid partyARole '${partyARole}' for Criminal GR. Allowed roles: ${validPartyARoles.join(', ')}`,
      };
    }
  } else if (category === 'criminal_cr') {
    const validOurRoles = ["Complainant's counsel", 'Defence counsel'];
    if (ourRole && !validOurRoles.includes(ourRole)) {
      return {
        valid: false,
        error: `Invalid ourRole '${ourRole}' for Criminal CR. Allowed roles: ${validOurRoles.join(', ')}`,
      };
    }
    const validPartyARoles = ['Complainant'];
    if (partyARole && !validPartyARoles.includes(partyARole)) {
      return {
        valid: false,
        error: `Invalid partyARole '${partyARole}' for Criminal CR. Allowed roles: ${validPartyARoles.join(', ')}`,
      };
    }
  } else if (category === 'civil') {
    const validOurRoles = [
      'Plaintiff',
      'Defendant',
      'Applicant',
      'Opposite Party',
      'Revisioner',
      'Respondent',
      'Appellant',
      'Petitioner',
    ];
    if (ourRole && !validOurRoles.includes(ourRole)) {
      return {
        valid: false,
        error: `Invalid ourRole '${ourRole}' for Civil. Allowed roles: ${validOurRoles.join(', ')}`,
      };
    }
  }
  return { valid: true };
}

export function formatCasePartyTitle(caseItem: {
  plaintiff: string;
  defendant: string;
  partyARole?: string | null;
  partyBRole?: string | null;
  ourRole?: CourtRole | null;
  caseCategory?: CaseCategory;
}): string {
  const roleA = caseItem.partyARole || (caseItem.caseCategory === 'criminal_gr' ? 'State' : caseItem.caseCategory === 'criminal_cr' ? 'Complainant' : 'Plaintiff');
  const roleB = caseItem.partyBRole || (caseItem.caseCategory?.startsWith('criminal') ? 'Accused' : 'Defendant');

  const sideAStr = caseItem.plaintiff ? `${caseItem.plaintiff} (${roleA})` : '';
  const sideBStr = caseItem.defendant ? `${caseItem.defendant} (${roleB})` : '';

  if (sideAStr && sideBStr) {
    return `${sideAStr} vs ${sideBStr}`;
  }
  return sideAStr || sideBStr || 'Untitled Case';
}

export const COMMON_COURT_SUGGESTIONS = [
  'Supreme Court of Bangladesh (Appellate Division)',
  'Supreme Court of Bangladesh (High Court Division)',
  'High Court Division (Company Bench)',
  'Dhaka District & Sessions Judge Court',
  '1st Joint District Judge Court, Dhaka',
  '2nd Joint District Judge Court, Dhaka',
  '3rd Joint District Judge Court, Dhaka',
  '1st Assistant Judge Court, Dhaka',
  'Chief Metropolitan Magistrate Court, Dhaka',
  'Metropolitan Sessions Judge Court, Dhaka',
  'Chief Judicial Magistrate Court, Dhaka',
  'Special Judge Court No. 1, Dhaka',
  'Labor Court No. 1, Dhaka',
  'Labor Appellate Tribunal, Dhaka',
  'Chattogram District & Sessions Judge Court',
  'Chief Judicial Magistrate Court, Chattogram',
  'Sylhet District & Sessions Judge Court',
  'Rajshahi District & Sessions Judge Court',
  'Khulna District & Sessions Judge Court',
];
