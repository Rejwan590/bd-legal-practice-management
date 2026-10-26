import { CaseCategory } from './types';

export interface FixedForOption {
  key: string;
  labelEn: string;
  labelBn: string;
}

export const CIVIL_FIXED_FOR_OPTIONS: FixedForOption[] = [
  { key: 'first_hearing', labelEn: 'First Hearing', labelBn: 'প্রথম শুনানি' },
  { key: 'written_statement', labelEn: 'Written Statement (W.S.)', labelBn: 'লিখিত জবাব (ডব্লিউ.এস)' },
  { key: 'framing_of_issues', labelEn: 'Framing of Issues', labelBn: 'বিচার্য বিষয় গঠন (ইস্যু গঠন)' },
  { key: 'hearing', labelEn: 'Hearing', labelBn: 'শুনানি' },
  { key: 'plaintiff_evidence', labelEn: 'Plaintiff Evidence (P.W.)', labelBn: 'বাদীর সাক্ষ্য' },
  { key: 'defendant_evidence', labelEn: 'Defendant Evidence (D.W.)', labelBn: 'বিবাদীর সাক্ষ্য' },
  { key: 'argument', labelEn: 'Argument', labelBn: 'যুক্তি-তর্ক' },
  { key: 'order', labelEn: 'Order', labelBn: 'আদেশ' },
  { key: 'judgment', labelEn: 'Judgment', labelBn: 'রায়' },
  { key: 'compliance', labelEn: 'Compliance', labelBn: 'কমপ্লায়েন্স / পালন' },
  { key: 'ex_parte_hearing', labelEn: 'Ex-Parte Hearing', labelBn: 'একতরফা শুনানি' },
  { key: 'peremptory_hearing', labelEn: 'Peremptory Hearing (P.H.)', labelBn: 'চূড়ান্ত শুনানি (পি.এইচ)' },
  { key: 'other', labelEn: 'Other', labelBn: 'অন্যান্য' },
];

export const CRIMINAL_FIXED_FOR_OPTIONS: FixedForOption[] = [
  { key: 'cognizance', labelEn: 'Cognizance', labelBn: 'আমল গ্রহণ (কগনিজেন্স)' },
  { key: 'charge_framing', labelEn: 'Charge Framing', labelBn: 'অভিযোগ গঠন (চার্জ গঠন)' },
  { key: 'witness_examination', labelEn: 'Witness Examination', labelBn: 'সাক্ষী পরীক্ষা (সাক্ষ্যগ্রহণ)' },
  { key: 'statement_of_accused', labelEn: 'Statement of Accused (Sec 342)', labelBn: 'আসামির জবানবন্দি (৩৪২ ধারা)' },
  { key: 'argument', labelEn: 'Argument', labelBn: 'যুক্তি-তর্ক' },
  { key: 'bail_hearing', labelEn: 'Bail Hearing', labelBn: 'জামিন শুনানি' },
  { key: 'remand', labelEn: 'Remand Hearing', labelBn: 'রিমান্ড শুনানি' },
  { key: 'order', labelEn: 'Order', labelBn: 'আদেশ' },
  { key: 'judgment', labelEn: 'Judgment', labelBn: 'রায়' },
  { key: 'compliance', labelEn: 'Compliance / Warrant', labelBn: 'কমপ্লায়েন্স / পরোয়ানা তামিল' },
  { key: 'other', labelEn: 'Other', labelBn: 'অন্যান্য' },
];

export const OTHER_FIXED_FOR_OPTIONS: FixedForOption[] = [
  { key: 'hearing', labelEn: 'Hearing', labelBn: 'শুনানি' },
  { key: 'order', labelEn: 'Order', labelBn: 'আদেশ' },
  { key: 'judgment', labelEn: 'Judgment', labelBn: 'রায়' },
  { key: 'other', labelEn: 'Other', labelBn: 'অন্যান্য' },
];

export function getFixedForOptionsForCategory(category?: CaseCategory | null): FixedForOption[] {
  if (category === 'criminal_gr' || category === 'criminal_cr') {
    return CRIMINAL_FIXED_FOR_OPTIONS;
  }
  if (category === 'civil') {
    return CIVIL_FIXED_FOR_OPTIONS;
  }
  return OTHER_FIXED_FOR_OPTIONS;
}

export function validateFixedFor(
  category: CaseCategory | string | undefined | null,
  fixedFor: string
): { valid: boolean; error?: string } {
  if (!fixedFor || typeof fixedFor !== 'string' || !fixedFor.trim()) {
    return { valid: false, error: 'fixed_for is required' };
  }
  const normalizedKey = fixedFor.trim();
  const cat = (category || 'civil') as CaseCategory;
  const options = getFixedForOptionsForCategory(cat);
  const exists = options.some((opt) => opt.key === normalizedKey);
  if (!exists) {
    return {
      valid: false,
      error: `Invalid fixed_for key '${fixedFor}' for case category '${cat}'. Allowed keys: ${options.map((o) => o.key).join(', ')}`,
    };
  }
  return { valid: true };
}

export function getFixedForLabel(key?: string | null, language: 'en' | 'bn' = 'en'): string {
  if (!key) return '';
  // Search across all option sets
  const all = [...CIVIL_FIXED_FOR_OPTIONS, ...CRIMINAL_FIXED_FOR_OPTIONS, ...OTHER_FIXED_FOR_OPTIONS];
  const match = all.find((opt) => opt.key === key);
  if (!match) return key;
  return language === 'bn' ? match.labelBn : match.labelEn;
}
