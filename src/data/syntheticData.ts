import {
  ClientRecord,
  CaseRecord,
  HearingRecord,
  HearingDateHistoryRecord,
  TaskRecord,
  ClientNoteRecord,
  AppointmentRecord,
  AppointmentAttendeeRecord,
  FeeAgreement,
  FeePayment,
  Expense,
  PhysicalFileRecord,
  FileMovementRecord,
} from './types';

export const SYNTHETIC_FIRM_ID = 'firm-bd-001';
export const OWNER_USER_ID = 'user-owner-001';
export const OWNER_USER_NAME = 'Adv. Mahbubur Rahman';
export const STAFF_USER_ID = 'user-staff-002';
export const STAFF_USER_NAME = 'Adv. Nusrat Jahan';

// Raw definitions for 100 realistic Bangladeshi clients
interface ClientRawDef {
  name: string;
  nameBn: string;
  phoneSuffix: number; // 900001 - 900100
  email?: string;
  address: string;
  notes: string;
  archived?: boolean;
}

const RAW_CLIENTS: ClientRawDef[] = [
  // 1-10: Dhaka Individuals (Civil, Property, Family)
  {
    name: 'Alhaj Shamsul Haque Majumder',
    nameBn: 'আলহাজ্ব শামসুল হক মজুমদার',
    phoneSuffix: 900001,
    email: 'shamsul.majumder@example.com',
    address: 'House 22, Road 7, Sector 3, Uttara, Dhaka-1230',
    notes: 'Ancestral land partition dispute in Uttara; partition deed drafted in 1998, opposite parties contesting boundary demarcation.',
  },
  {
    name: 'Dr. Shahana Akhter Banu',
    nameBn: 'ডা. শাহানা আক্তার বানু',
    phoneSuffix: 900002,
    email: 'dr.shahana.banu@example.org',
    address: 'Flat 5A, Green Del Vista, Dhanmondi 8/A, Dhaka-1209',
    notes: 'Consultation regarding inheritance share in Dhanmondi residential plot under Muslim Personal Law (Shariat).',
  },
  {
    name: 'Engr. Tariqul Islam Chowdhury',
    nameBn: 'প্রকৌ. তরিকুল ইসলাম চৌধুরী',
    phoneSuffix: 900003,
    email: 'tariqul.chowdhury@example.com',
    address: 'Holding 45/B, Lake Circus, Kalabagan, Dhaka-1205',
    notes: 'Developer agreement dispute regarding non-delivery of flat allocation within contractual handover deadline.',
  },
  {
    name: 'Nasima Sultana Parveen',
    nameBn: 'নাসিমা সুলতানা পারভীন',
    phoneSuffix: 900004,
    address: 'House 18, Block D, Bashundhara R/A, Dhaka-1229',
    notes: 'Family Court maintenance and dower money recovery suit against former spouse.',
  },
  {
    name: 'Advocate Golam Mostafa',
    nameBn: 'অ্যাডভোকেট গোলাম মোস্তফা',
    phoneSuffix: 900005,
    email: 'golam.mostafa.law@example.org',
    address: '12 Court House Street, Kotwali, Dhaka-1100',
    notes: 'Chamber colleague referral. Special civil revision in High Court Division regarding decree execution stayed ex-parte.',
  },
  {
    name: 'Md. Abdul Halim Mollah',
    nameBn: 'মো. আবদুল হালিম মোল্লা',
    phoneSuffix: 900006,
    address: 'Village: Badda, Post: Demra, Demra, Dhaka-1360',
    notes: 'Land Survey Tribunal case regarding erroneous recording in BS Khatian; seeking rectification.',
  },
  {
    name: 'Farhana Yeasmin Khanam',
    nameBn: 'ফারহানা ইয়াসমিন খানম',
    phoneSuffix: 900007,
    email: 'farhana.khanam@example.com',
    address: 'Apartment 3B, Sena Kalyan Heights, Mohakhali DOHS, Dhaka-1206',
    notes: 'Bank employment wrongful termination grievance; service matter writ petition before Supreme Court.',
  },
  {
    name: 'Kazi Nurul Alam',
    nameBn: 'কাজী নুরুল আলম',
    phoneSuffix: 900008,
    address: '89 Lalbagh Road, Lalbagh, Old Dhaka-1211',
    notes: 'Waqf estate mutawalli succession contest before Waqf Administrator and District Court.',
  },
  {
    name: 'Sabrina Hossain Bristy',
    nameBn: 'সাবরিনা হোসেন বৃষ্টি',
    phoneSuffix: 900009,
    email: 'sabrina.bristy@example.org',
    address: 'Road 11, Block F, Banani, Dhaka-1213',
    notes: 'Trademark infringement matter regarding proprietary fashion apparel brand label.',
  },
  {
    name: 'Mirza Asaduzzaman',
    nameBn: 'মির্জা আসাদুজ্জামান',
    phoneSuffix: 900010,
    email: 'mirza.asad@example.com',
    address: 'House 7, Road 14, Sector 11, Uttara, Dhaka-1230',
    notes: 'Contractual default claim under Section 73 Contract Act against civil engineering sub-contractor.',
  },

  // 11-20: Chattogram & Cox's Bazar Individuals & Businessmen
  {
    name: 'Khatunganj Commodity Trading & Distribution Ltd.',
    nameBn: 'খাতুনগঞ্জ কমোডিটি ট্রেডিং অ্যান্ড ডিস্ট্রিবিউশন লিমিটেড',
    phoneSuffix: 900011,
    email: 'nurul.absar.ctg@example.com',
    address: 'Khatunganj Commercial Area, Kotwali, Chattogram-4000',
    notes: 'High-value commodity trading contract recovery and Section 138 NI Act cheque dishonour proceedings.',
  },
  {
    name: 'Barrister Saifur Rahman Chowdhury',
    nameBn: 'ব্যারিস্টার সাইফুর রহমান চৌধুরী',
    phoneSuffix: 900012,
    email: 'saifur.chowdhury@example.org',
    address: 'East Nasirabad CDA R/A, Panchlaish, Chattogram-4203',
    notes: 'Consultation on maritime admiralty suit pending before High Court Admiralty Bench.',
  },
  {
    name: 'Mohammad Jane Alam',
    nameBn: 'মোহাম্মদ জানে আলম',
    phoneSuffix: 900013,
    address: 'Strand Road, Sadarghat, Chattogram-4000',
    notes: 'Lighterage vessel charterparty agreement dispute and unpaid freight compensation.',
  },
  {
    name: 'Anwara Begum',
    nameBn: 'আনোয়ারা বেগম',
    phoneSuffix: 900014,
    address: 'South Halishahar, Bandar, Chattogram-4218',
    notes: 'Eviction suit against commercial tenant overstaying lease in Halishahar warehouse.',
  },
  {
    name: 'Didarul Alam Shikder',
    nameBn: 'দিদারুল আলম শিকদার',
    phoneSuffix: 900015,
    email: 'didar.shikder@example.com',
    address: 'Chiringa Bazar, Chakaria, Cox’s Bazar-4740',
    notes: 'Acquisition of salt pans land by Roads & Highways Department; compensation enhancement reference.',
  },
  {
    name: 'Farid Ahmed Talukder',
    nameBn: 'ফরিদ আহমেদ তালুকদার',
    phoneSuffix: 900016,
    address: 'Kolatoli Road, Cox’s Bazar Sadar, Cox’s Bazar-4700',
    notes: 'Hotel lease cancellation notice challenged via ad-interim injunction.',
  },
  {
    name: 'Syeda Rehana Sultana',
    nameBn: 'সৈয়দা রেহানা সুলতানা',
    phoneSuffix: 900017,
    email: 'rehana.sultana.ctg@example.org',
    address: 'O.R. Nizam Road, GEC Circle, Chattogram-4000',
    notes: 'Probate of will executed by late father bequeathing commercial premises in Agrabad.',
  },
  {
    name: 'SM Morshedul Islam',
    nameBn: 'এস এম মোরশেদুল ইসলাম',
    phoneSuffix: 900018,
    address: 'Muradpur, Panchlaish, Chattogram-4211',
    notes: 'Motor vehicle accident compensation claim before Motor Accidents Claims Tribunal.',
  },
  {
    name: 'Zahirul Haque Bhuiyan',
    nameBn: 'জহিরুল হক ভূঁইয়া',
    phoneSuffix: 900019,
    email: 'zahir.bhuiyan@example.com',
    address: 'Agrabad Access Road, Double Mooring, Chattogram-4100',
    notes: 'Customs valuation dispute on industrial machinery import at Chittagong Port.',
  },
  {
    name: 'Rasheda Parveen Baby',
    nameBn: 'রাশেদা পারভীন বেবী',
    phoneSuffix: 900020,
    address: 'Jhautala R/A, Pahartali, Chattogram-4202',
    notes: 'Family guardianship petition regarding minor daughter and management of inherited properties.',
  },

  // 21-30: Sylhet Individuals & Expatriates
  {
    name: 'Alhaj Muhibur Rahman (Londoni)',
    nameBn: 'আলহাজ্ব মুহিবুর রহমান (লন্ডনী)',
    phoneSuffix: 900021,
    email: 'muhibur.rahman.uk@example.com',
    address: 'Zindabazar Point, Sylhet Sadar, Sylhet-3100',
    notes: 'Expatriate non-resident Bangladeshi client. Illegal trespassing and encroachment on Londoni ancestral estate.',
  },
  {
    name: 'Chowdhury Fazle Rabbi',
    nameBn: 'চৌধুরী ফজলে রাব্বী',
    phoneSuffix: 900022,
    email: 'rabbi.chowdhury@example.org',
    address: 'Subidbazar, Sylhet Sadar, Sylhet-3100',
    notes: 'Declaration of title suit and cancellation of forged power of attorney registered in Sunamganj.',
  },
  {
    name: 'Kamrun Nahar Shirin',
    nameBn: 'কামরুন নাহার শিরীন',
    phoneSuffix: 900023,
    address: 'Amberkhana, Sylhet Sadar, Sylhet-3100',
    notes: 'Execution of family court decree for recovery of unpaid maintenance arrears.',
  },
  {
    name: 'Dr. Mokhlesur Rahman',
    nameBn: 'ডা. মোখলেছুর রহমান',
    phoneSuffix: 900024,
    email: 'dr.mokhlesur@example.com',
    address: 'Hospital Road, Moulvibazar Sadar, Moulvibazar-3200',
    notes: 'Medical negligence defense in complaint filed with Consumer Rights Protection Directorate.',
  },
  {
    name: 'Abdul Matin Chowdhury',
    nameBn: 'আবদুল মতিন চৌধুরী',
    phoneSuffix: 900025,
    address: 'Habiganj Road, Nabiganj, Habiganj-3330',
    notes: 'Land reform tenancy dispute regarding tea-estate adjacent agricultural lands.',
  },
  {
    name: 'Jannatul Ferdous Runa',
    nameBn: 'জান্নাতুল ফেরদৌস রুনা',
    phoneSuffix: 900026,
    email: 'jannat.runa@example.org',
    address: 'Shahi Eidgah, Sylhet-3100',
    notes: 'Contractual dispute with micro-finance NGO over loan guarantee enforcement.',
  },
  {
    name: 'Mustafa Kamal Pasha',
    nameBn: 'মুস্তফা কামাল পাশা',
    phoneSuffix: 900027,
    address: 'Station Road, Sreemangal, Moulvibazar-3210',
    notes: 'Resort land lease agreement renewal dispute with Forest Department.',
  },
  {
    name: 'Salma Khatun Chowdhury',
    nameBn: 'সালমা খাতুন চৌধুরী',
    phoneSuffix: 900028,
    email: 'salma.khatun@example.com',
    address: 'South Surma, Sylhet-3100',
    notes: 'Injunction against unlawful canal encroachment obstructing agricultural drainage.',
  },
  {
    name: 'Azharul Islam Laskar',
    nameBn: 'আজহারুল ইসলাম লস্কর',
    phoneSuffix: 900029,
    address: 'Sunamganj Sadar, Sunamganj-3000',
    notes: 'Haor fisheries leasing leaseholder rights writ before Supreme Court.',
  },
  {
    name: 'Shahed Ahmed',
    nameBn: 'শাহেদ আহমেদ',
    phoneSuffix: 900030,
    email: 'shahed.ahmed@example.org',
    address: 'Pathantula, Sylhet-3100',
    notes: 'Money suit for recovery of outstanding loan given against promissory note.',
  },

  // 31-40: Rajshahi & Bogura Region
  {
    name: 'Professor Md. Mizanur Rahman',
    nameBn: 'অধ্যাপক মো. মিজানুর রহমান',
    phoneSuffix: 900031,
    email: 'mizanur.ru@example.com',
    address: 'Rajshahi University Campus, Motihar, Rajshahi-6205',
    notes: 'Service seniority dispute writ petition before Supreme Court High Court Division.',
  },
  {
    name: 'Haji Mohammad Nazrul Islam',
    nameBn: 'হাজী মোহাম্মদ নজরুল ইসলাম',
    phoneSuffix: 900032,
    address: 'Shaheb Bazar, Boalia, Rajshahi-6000',
    notes: 'Commercial rent control dispute and tenant eviction on ground of bonafide personal requirement.',
  },
  {
    name: 'Begum Hosne Ara',
    nameBn: 'বেগম হোসনে আরা',
    phoneSuffix: 900033,
    email: 'hosne.ara.raj@example.org',
    address: 'Kazihata, Rajput, Rajshahi-6000',
    notes: 'Partition suit regarding inherited mango orchard in Charghat Upazila.',
  },
  {
    name: 'Bogura Agro Processors & Cold Storage Ltd.',
    nameBn: 'বগুড়া এগ্রো প্রসেসরস অ্যান্ড কোল্ড স্টোরেজ লিমিটেড',
    phoneSuffix: 900034,
    email: 'rafiqul.akand@example.com',
    address: 'Borogola, Bogura Sadar, Bogura-5800',
    notes: 'Agro-processing cold storage electricity tariff dispute with NESCO.',
  },
  {
    name: 'Dr. SM Mahbubur Rahman',
    nameBn: 'ডা. এস এম মাহবুবুর রহমান',
    phoneSuffix: 900035,
    address: 'Thanthania, Bogura Sadar, Bogura-5800',
    notes: 'Clinical establishment partnership dissolution and accounting of firm assets.',
  },
  {
    name: 'Lutfun Nahar Begum',
    nameBn: 'লুৎফুন নাহার বেগম',
    phoneSuffix: 900036,
    email: 'lutfun.nahar@example.org',
    address: 'Uposhahar, Boalia, Rajshahi-6202',
    notes: 'Pre-emption suit under Section 96 State Acquisition and Tenancy Act.',
  },
  {
    name: 'Khandakar Enamul Haque',
    nameBn: 'খন্দকার এনামুল হক',
    phoneSuffix: 900037,
    address: 'Sherpur Road, Bogura-5800',
    notes: 'Motor vehicle third party insurance compensation claim.',
  },
  {
    name: 'Mst. Shireen Akhter',
    nameBn: 'মোছা. শিরীন আক্তার',
    phoneSuffix: 900038,
    address: 'Godagari Bazar, Godagari, Rajshahi-6290',
    notes: 'Border lands khas land settlement cancellation challenge.',
  },
  {
    name: 'Abdus Samad Pramanik',
    nameBn: 'আবদুস সামাদ প্রামাণিক',
    phoneSuffix: 900039,
    email: 'samad.pramanik@example.com',
    address: 'Santahar Road, Naogaon Sadar, Naogaon-6500',
    notes: 'Rice mill auto-dryer machine supply warranty enforcement suit.',
  },
  {
    name: 'Golam Rabbani Sarkar',
    nameBn: 'গোলাম রব্বানী সরকার',
    phoneSuffix: 900040,
    address: 'Baluatola, Bogura Sadar, Bogura-5800',
    notes: 'Cheque dishonour under NI Act Section 138 regarding grain trading invoice.',
  },

  // 41-50: Khulna & Barishal Region
  {
    name: 'Rupsha Sea Foods & Cold Storage Ltd.',
    nameBn: 'রূপসা সী ফুডস অ্যান্ড কোল্ড স্টোরেজ লিমিটেড',
    phoneSuffix: 900041,
    email: 'asad.khulna@example.com',
    address: 'KDA Avenue, Sonadanga, Khulna-9100',
    notes: 'Shrimp export processing plant bank loan restructuring under Artha Rin Adalat Ain.',
  },
  {
    name: 'Kazi Monirul Islam',
    nameBn: 'কাজী মনিরুল ইসলাম',
    phoneSuffix: 900042,
    address: 'Khalishpur Industrial Area, Khulna-9000',
    notes: 'Labour Court industrial dispute regarding workers retrenchment benefits.',
  },
  {
    name: 'Rehana Parvin Daisy',
    nameBn: 'রেহানা পারভীন ডেইজী',
    phoneSuffix: 900043,
    email: 'rehana.daisy@example.org',
    address: 'Boyra R/A, Khulna-9000',
    notes: 'Title suit regarding river erosion reclaimed land (Alluvion/Diluvion Regulation).',
  },
  {
    name: 'Al-Haj Fazlul Karim Sikder',
    nameBn: 'আলহাজ্ব ফজলুল করিম সিকদার',
    phoneSuffix: 900044,
    address: 'Sadullahpur Road, Barishal Sadar, Barishal-8200',
    notes: 'Inland water transport passenger launch operation route permit dispute.',
  },
  {
    name: 'Advocate Shamsun Nahar',
    nameBn: 'অ্যাডভোকেট শামসুন নাহার',
    phoneSuffix: 900045,
    email: 'nahar.law.barishal@example.com',
    address: 'Court Road, Barishal-8200',
    notes: 'Bar Council chamber association matter and Barishal District Court practice coordination.',
  },
  {
    name: 'Md. Delwar Hossain Howlader',
    nameBn: 'মো. দেলোয়ার হোসেন হাওলাদার',
    phoneSuffix: 900046,
    address: 'Kawnia, Barishal Sadar, Barishal-8200',
    notes: 'Mortgage redemption suit against regional cooperative development bank.',
  },
  {
    name: 'Gazi Mohammad Nuruzzaman',
    nameBn: 'গাজী মোহাম্মদ নুরুজ্জামান',
    phoneSuffix: 900047,
    address: 'Mujgunni R/A, Khalishpur, Khulna-9000',
    notes: 'Consumer protection dispute regarding defective building elevators.',
  },
  {
    name: 'Mst. Parul Begum',
    nameBn: 'মোছা. পারুল বেগম',
    phoneSuffix: 900048,
    email: 'parul.begum.barishal@example.org',
    address: 'Rupatali, Barishal-8200',
    notes: 'Family Court divorce confirmation and child custody decree implementation.',
  },
  {
    name: 'Tofazzal Hossain Mallick',
    nameBn: 'তোফাজ্জল হোসেন মল্লিক',
    phoneSuffix: 900049,
    address: 'Bagerhat Road, Rupsha, Khulna-9241',
    notes: 'Fishery ghat auction tender cancellation writ petition.',
  },
  {
    name: 'Shah Alam Matubbar',
    nameBn: 'শাহ আলম মাতুব্বর',
    phoneSuffix: 900050,
    address: 'Patuakhali Sadar, Patuakhali-8600',
    notes: 'Coastal polder embankment breach damage compensation claim against contractor.',
  },

  // 51-60: Rangpur, Dinajpur & Mymensingh Region
  {
    name: 'Alhaj Md. Mokhlesur Rahman Sarker',
    nameBn: 'আলহাজ্ব মো. মোখলেছুর রহমান সরকার',
    phoneSuffix: 900051,
    email: 'mokhlesur.rangpur@example.com',
    address: 'Jahaj Company Mor, Station Road, Rangpur-5400',
    notes: 'Tobacco processing contract dispute and recovery of security deposit.',
  },
  {
    name: 'Begum Rokeya Parveen',
    nameBn: 'বেগম রোকেয়া পারভীন',
    phoneSuffix: 900052,
    address: 'Dhap, Rangpur Sadar, Rangpur-5400',
    notes: 'Injunction against municipality demolition notice issued without statutory notice.',
  },
  {
    name: 'Md. Anisur Rahman Dulal',
    nameBn: 'মো. আনিসুর রহমান দুলাল',
    phoneSuffix: 900053,
    email: 'anisur.dinajpur@example.org',
    address: 'Nimtola, Dinajpur Sadar, Dinajpur-5200',
    notes: 'Agricultural cold storage license renewal cancellation writ in Supreme Court.',
  },
  {
    name: 'Haji Mohammad Golam Kibria',
    nameBn: 'হাজী মোহাম্মদ গোলাম কিবরিয়া',
    phoneSuffix: 900054,
    address: 'Choto Bazar, Mymensingh Sadar, Mymensingh-2200',
    notes: 'Commercial shop allotment eviction appeal before District Judge Mymensingh.',
  },
  {
    name: 'Dr. Fatima Begum',
    nameBn: 'ডা. ফাতিমা বেগম',
    phoneSuffix: 900055,
    email: 'dr.fatima.mym@example.com',
    address: 'Charpara, Mymensingh-2200',
    notes: 'Private clinic license suspension appeal before Ministry of Health.',
  },
  {
    name: 'Khandakar Mofazzal Hossain',
    nameBn: 'খন্দকার মোফাজ্জল হোসেন',
    phoneSuffix: 900056,
    address: 'Goneshtola, Dinajpur Sadar, Dinajpur-5200',
    notes: 'Partition of ancestral homestead lands in Birol Upazila.',
  },
  {
    name: 'Mst. Hasna Hena',
    nameBn: 'মোছা. হাসনা হেনা',
    phoneSuffix: 900057,
    address: 'Modern Mor, Rangpur-5400',
    notes: 'Recovery of loan arrears under Section 138 NI Act with legal notice served.',
  },
  {
    name: 'Md. Shahidul Islam Talukder',
    nameBn: 'মো. শহিদুল ইসলাম তালুকদার',
    phoneSuffix: 900058,
    email: 'shahidul.talukder@example.org',
    address: 'Kashor, Mymensingh Sadar, Mymensingh-2200',
    notes: 'Land survey objection under Section 30 of Survey Regulation.',
  },
  {
    name: 'Sultana Razia',
    nameBn: 'সুলতানা রাজিয়া',
    phoneSuffix: 900059,
    address: 'Sadar Hospital Road, Kurigram-5600',
    notes: 'Inheritance certificate and succession succession certificate under Indian Succession Act.',
  },
  {
    name: 'Mohammad Lutfor Rahman',
    nameBn: 'মোহাম্মদ লুৎফর রহমান',
    phoneSuffix: 900060,
    address: 'Shapla Chottor, Rangpur-5400',
    notes: 'Artha Rin Adalat bank auction notification challenge under Section 33(1).',
  },

  // 61-70: Cumilla, Noakhali, Brahmanbaria & Gazipur
  {
    name: 'Kandirpar Plaza Commercial Enterprise Ltd.',
    nameBn: 'কান্দিরপাড় প্লাজা কমার্শিয়াল এন্টারপ্রাইজ লিমিটেড',
    phoneSuffix: 900061,
    email: 'kashem.cumilla@example.com',
    address: 'Kandirpar, Cumilla Sadar, Cumilla-3500',
    notes: 'Commercial shopping plaza shop ownership registration deed enforcement suit.',
  },
  {
    name: 'Al-Haj Nurul Huda Bhuiyan',
    nameBn: 'আলহাজ্ব নুরুল হুদা ভূঁইয়া',
    phoneSuffix: 900062,
    address: 'Badurtola, Cumilla Sadar, Cumilla-3500',
    notes: 'Boundary dispute with Cumilla Cantonment adjacent private landholding.',
  },
  {
    name: 'Begum Shamsun Nahar Chowdhury',
    nameBn: 'বেগম শামসুন নাহার চৌধুরী',
    phoneSuffix: 900063,
    email: 'shamsun.noakhali@example.org',
    address: 'Maijdee Court, Noakhali Sadar, Noakhali-3800',
    notes: 'Dower recovery and family property decree execution.',
  },
  {
    name: 'Advocate Monirul Haque',
    nameBn: 'অ্যাডভোকেট মনিরুল হক',
    phoneSuffix: 900064,
    address: 'Court Road, Brahmanbaria-3400',
    notes: 'Gas-field acquired land compensation distribution among co-sharers.',
  },
  {
    name: 'Md. Sirajul Islam Bepari',
    nameBn: 'মো. সিরাজুল ইসলাম বেপারী',
    phoneSuffix: 900065,
    email: 'sirajul.bepari@example.com',
    address: 'Joydebpur Chowrasta, Gazipur-1700',
    notes: 'Industrial land conversion dispute with Rajuk/Gazipur Development Authority.',
  },
  {
    name: 'Farida Akhter Banu',
    nameBn: 'ফরিদা আক্তার বানু',
    phoneSuffix: 900066,
    address: 'Chowmuhani, Begumganj, Noakhali-3821',
    notes: 'Commercial godown lease default and recovery of possession.',
  },
  {
    name: 'Gazipur Industrial Fabrics & Dyeing Ltd.',
    nameBn: 'গাজীপুর ইন্ডাস্ট্রিয়াল ফেব্রিক্স অ্যান্ড ডাইং লিমিটেড',
    phoneSuffix: 900067,
    address: 'Board Bazar, Gazipur Sadar, Gazipur-1704',
    notes: 'Factory building fire insurance compensation claim against general insurer.',
  },
  {
    name: 'Mst. Jahanara Begum',
    nameBn: 'মোছা. জাহানারা বেগম',
    phoneSuffix: 900068,
    email: 'jahanara.brahman@example.org',
    address: 'Medda, Brahmanbaria Sadar, Brahmanbaria-3400',
    notes: 'Title suit regarding land partition in Nabinagar Upazila.',
  },
  {
    name: 'Md. Harun-ur-Rashid',
    nameBn: 'মো. হারুন-অর-রশীদ',
    phoneSuffix: 900069,
    address: 'Tongi Bazar, Tongi, Gazipur-1710',
    notes: 'Labour Court compensation suit for industrial workplace injury.',
  },
  {
    name: 'Abdul Wadud Patwary',
    nameBn: 'আবদুল ওয়াদুদ পাটোয়ারী',
    phoneSuffix: 900070,
    address: 'Chandpur Ghat, Chandpur Sadar, Chandpur-3600',
    notes: 'River dredging lease dispute before Joint District Judge Chandpur.',
  },

  // 71-85: Narayanganj, Tangail, Kushtia, Jessore, Pabna & Other Districts
  {
    name: 'Ali Yarn & Dyeing Mills Ltd.',
    nameBn: 'আলী সুতা ও ডাইং মিলস লিমিটেড',
    phoneSuffix: 900071,
    email: 'ali.narayanganj@example.com',
    address: 'Tanbazar, Narayanganj Sadar, Narayanganj-1400',
    notes: 'Yarn trading contract dispute and recovery of BDT 8.5 million dues under summary suit.',
  },
  {
    name: 'Begum Ferdousi Rahman',
    nameBn: 'বেগম ফেরদৌসী রহমান',
    phoneSuffix: 900072,
    address: 'Chashara, Narayanganj-1400',
    notes: 'Title declaration and permanent injunction suit against BIWTA riverbank evictions.',
  },
  {
    name: 'Md. Shahjahan Miah',
    nameBn: 'মো. শাহজাহান মিয়া',
    phoneSuffix: 900073,
    email: 'shahjahan.tangail@example.org',
    address: 'Victoria Road, Tangail Sadar, Tangail-1900',
    notes: 'Handloom cooperative society asset distribution dispute.',
  },
  {
    name: 'Dr. Asadul Haque Mollah',
    nameBn: 'ডা. আসাদুল হক মোল্লা',
    phoneSuffix: 900074,
    address: 'Court Para, Kushtia Sadar, Kushtia-7000',
    notes: 'Partition of ancestral agricultural lands in Kumarkhali Upazila.',
  },
  {
    name: 'Benapole Customs Clearing & Forwarding Ltd.',
    nameBn: 'বেনাপোল কাস্টমস ক্লিয়ারিং অ্যান্ড ফরওয়ার্ডিং লিমিটেড',
    phoneSuffix: 900075,
    email: 'sarwar.jessore@example.com',
    address: 'Mujib Road, Jashore Sadar, Jashore-7400',
    notes: 'Benapole land port customs clearing agency license suspension writ.',
  },
  {
    name: 'Mst. Selina Akhter',
    nameBn: 'মোছা. সেলিনা আক্তার',
    phoneSuffix: 900076,
    address: 'Pabna Sadar, Pabna-6600',
    notes: 'Family Court maintenance decree execution and salary attachment.',
  },
  {
    name: 'Md. Kamrul Hasan Bhuiyan',
    nameBn: 'মো. কামরুল হাসান ভূঁইয়া',
    phoneSuffix: 900077,
    address: 'Kanchpur, Sonargaon, Narayanganj-1440',
    notes: 'Highway acquisition compensation reference under Act of 2017.',
  },
  {
    name: 'Advocate SM Rezaul Karim',
    nameBn: 'অ্যাডভোকেট এস এম রেজাউল করিম',
    phoneSuffix: 900078,
    email: 'rezaul.faridpur@example.org',
    address: 'Goalchamot, Faridpur Sadar, Faridpur-7800',
    notes: 'Chamber network associate; civil appeal brief consultation in High Court.',
  },
  {
    name: 'Khandakar Anwarul Islam',
    nameBn: 'খন্দকার আনোয়ারুল ইসলাম',
    phoneSuffix: 900079,
    address: 'Court Bazar, Jamalpur Sadar, Jamalpur-2000',
    notes: 'Sand quarry leasing challenge before Divisional Commissioner.',
  },
  {
    name: 'Mst. Nurjahan Begum',
    nameBn: 'মোছা. নুরজাহান বেগম',
    phoneSuffix: 900080,
    address: 'Sirajganj Road, Sirajganj-6700',
    notes: 'Jamuna river charland ownership title suit.',
  },
  {
    name: 'Engr. Mahbub Alam Sarker',
    nameBn: 'প্রকৌ. মাহবুব আলম সরকার',
    phoneSuffix: 900081,
    email: 'mahbub.sarker@example.com',
    address: 'Savar Bazar, Savar, Dhaka-1340',
    notes: 'Ready-made garment factory compliance order challenge before Factory Inspectorate.',
  },
  {
    name: 'Begum Tahmina Akhter',
    nameBn: 'বেগম তাহমিনা আক্তার',
    phoneSuffix: 900082,
    address: 'Madaripur Sadar, Madaripur-7900',
    notes: 'Padma Bridge approach road land compensation enhancement petition.',
  },
  {
    name: 'Md. Zillur Rahman Molla',
    nameBn: 'মো. জিল্লুর রহমান মোল্লা',
    phoneSuffix: 900083,
    address: 'Gopalganj Sadar, Gopalganj-8100',
    notes: 'Aquaculture farm embankment waterlogging damages claim.',
  },
  {
    name: 'Al-Haj Md. Yunus Ali',
    nameBn: 'আলহাজ্ব মো. ইউনুস আলী',
    phoneSuffix: 900084,
    email: 'yunus.cox@example.org',
    address: 'Teknaf Sadar, Teknaf, Cox’s Bazar-4760',
    notes: 'Border trade permit regulatory dispute with National Board of Revenue.',
  },
  {
    name: 'Syed Monowar Hossain',
    nameBn: 'সৈয়দ মনোয়ার হোসেন',
    phoneSuffix: 900085,
    address: 'Feni Sadar, Feni-3900',
    notes: 'Ex-parte partition decree set aside application under Order 9 Rule 13 CPC.',
  },

  // 86-90: Corporate & Organizational Clients (Active)
  {
    name: 'Meghna Agro Industries Ltd.',
    nameBn: 'মেঘনা এগ্রো ইন্ডাস্ট্রিজ লিমিটেড',
    phoneSuffix: 900086,
    email: 'legal.meghna.agro@example.com',
    address: 'Meghna Industrial Park, Meghnaghat, Sonargaon, Narayanganj-1440',
    notes: 'High-value commercial arbitration and corporate guarantee enforcement litigation.',
  },
  {
    name: 'Shurjo Textiles & Spinning Mills PLC',
    nameBn: 'সূর্য টেক্সটাইলস অ্যান্ড স্পিনিং মিলস পিএলসি',
    phoneSuffix: 900087,
    email: 'corporate.shurjo.textiles@example.org',
    address: 'Plot 78-82, Adamjee EPZ, Siddhirganj, Narayanganj-1431',
    notes: 'LC dispute with commercial bank regarding discrepancy notice and letter of indemnity.',
  },
  {
    name: 'Karnafuli Freight & Logistics Ltd.',
    nameBn: 'কর্ণফুলী ফ্রেট অ্যান্ড লজিস্টিকস লিমিটেড',
    phoneSuffix: 900088,
    email: 'compliance.karnafuli@example.com',
    address: 'Sk. Mujib Road, Agrabad C/A, Chattogram-4100',
    notes: 'Admiralty collision damages claim and container demurrage dispute before High Court.',
  },
  {
    name: 'Padma Holdings & Real Estate Ltd.',
    nameBn: 'পদ্মা হোল্ডিংস অ্যান্ড রিয়েল এস্টেট লিমিটেড',
    phoneSuffix: 900089,
    email: 'legal.padma.holdings@example.org',
    address: 'Level 14, BDBL Bhaban, 8 Rajuk Avenue, Motijheel, Dhaka-1000',
    notes: 'Joint venture land development dispute and arbitration under Bangladesh Arbitration Act 2001.',
  },
  {
    name: 'Borno Printers & Publications Ltd.',
    nameBn: 'বর্ণ প্রিন্টার্স অ্যান্ড পাবলিকেশন্স লিমিটেড',
    phoneSuffix: 900090,
    email: 'borno.legal@example.com',
    address: '38/2 Bangla Bazar, Kotwali, Old Dhaka-1100',
    notes: 'Copyright infringement litigation regarding school textbook printing and distribution.',
  },

  // 91-100: Archived Clients (Testing archive filtering, restore & historical dossier)
  {
    name: 'Late Alhaj Momtazuddin Ahmed',
    nameBn: 'মরহুম আলহাজ্ব মমতাজউদ্দিন আহমেদ',
    phoneSuffix: 900091,
    address: 'Road 5, Dhanmondi, Dhaka-1205',
    notes: 'Client deceased in 2024; probate concluded and estate distributed among legal heirs. Archived client dossier.',
    archived: true,
  },
  {
    name: 'Sonargaon Ceramic Industries (Defunct)',
    nameBn: 'সোনারগাঁও সিরামিক ইন্ডাস্ট্রিজ (বিলুপ্ত)',
    phoneSuffix: 900092,
    email: 'contact.sonargaon@example.org',
    address: 'Kanchpur, Narayanganj-1440',
    notes: 'Company wound up by order of High Court Company Bench; final receiver discharge granted. Archived.',
    archived: true,
  },
  {
    name: 'Mohammad Ebadur Rahman',
    nameBn: 'মোহাম্মদ এবাদুর রহমান',
    phoneSuffix: 900093,
    address: 'Ambarkhana, Sylhet-3100',
    notes: 'Title suit No. 12/2019 resolved via compromised Sullahnama decree. File closed and archived.',
    archived: true,
  },
  {
    name: 'Begum Rabeya Khatun',
    nameBn: 'বেগম রাবেয়া খাতুন',
    phoneSuffix: 900094,
    email: 'rabeya.khatun.archive@example.com',
    address: 'Muradpur, Chattogram-4211',
    notes: 'Dower and maintenance suit compromised in 2023. Client dossier archived upon full settlement.',
    archived: true,
  },
  {
    name: 'Khandakar Zillur Rahman',
    nameBn: 'খন্দকার জিল্লুর রহমান',
    phoneSuffix: 900095,
    address: 'Shaheb Bazar, Rajshahi-6000',
    notes: 'Pre-emption matter disposed of by District Judge; no appeal preferred. Archived.',
    archived: true,
  },
  {
    name: 'Delta Shipping & Marine Lines (Pvt) Ltd.',
    nameBn: 'ডেল্টা শিপিং অ্যান্ড মেরিন লাইনস (প্রা.) লিমিটেড',
    phoneSuffix: 900096,
    email: 'legal.delta.shipping@example.org',
    address: 'Strand Road, Sadarghat, Chattogram-4000',
    notes: 'Maritime insurance claim settled out of court through international mediation. Dossier archived.',
    archived: true,
  },
  {
    name: 'Md. Shahidul Huq Bhuiyan',
    nameBn: 'মো. শহিদুল হক ভূঁইয়া',
    phoneSuffix: 900097,
    address: 'Chowk Bazar, Cumilla-3500',
    notes: 'Money suit 44/2021 fully satisfied through execution of decree. Client dossier archived.',
    archived: true,
  },
  {
    name: 'Dr. Quazi Mizanur Rahman',
    nameBn: 'ডা. কাজী মিজানুর রহমান',
    phoneSuffix: 900098,
    email: 'quazi.mizanur.archived@example.com',
    address: 'Dhap, Rangpur-5400',
    notes: 'Service matter writ petition disposed of with direction to Ministry. Matter concluded; archived.',
    archived: true,
  },
  {
    name: 'Kushtia Tobacco Trading Syndicate',
    nameBn: 'কুষ্টিয়া টোবাকো ট্রেডিং সিন্ডিকেট',
    phoneSuffix: 900099,
    address: 'Majampur, Kushtia-7000',
    notes: 'Partnership firm dissolved mutually in 2023. Accounts settled and recorded. Archived.',
    archived: true,
  },
  {
    name: 'Al-Haj Shamsur Rahman Talukder',
    nameBn: 'আলহাজ্ব শামসুর রহমান তালুকদার',
    phoneSuffix: 900100,
    email: 'shamsur.talukder.archived@example.org',
    address: 'Choto Bazar, Mymensingh-2200',
    notes: 'Title suit No. 98/2020 ended in final decree and possession delivery through court bailiff. File archived.',
    archived: true,
  },
];

export interface SyntheticDataset {
  clients: ClientRecord[];
  cases: CaseRecord[];
  hearings: HearingRecord[];
  hearingDateHistory: HearingDateHistoryRecord[];
  tasks: TaskRecord[];
  clientNotes: ClientNoteRecord[];
  appointments: AppointmentRecord[];
  appointmentAttendees: AppointmentAttendeeRecord[];
  feeAgreements: FeeAgreement[];
  feePayments: FeePayment[];
  expenses: Expense[];
  physicalFiles: PhysicalFileRecord[];
  fileMovements: FileMovementRecord[];
}

let cachedDataset: SyntheticDataset | null = null;

export function generateSyntheticDataset(): SyntheticDataset {
  if (cachedDataset) {
    return cachedDataset;
  }

  // 1. Generate Exactly 100 Clients
  const clients: ClientRecord[] = RAW_CLIENTS.map((raw, idx) => {
    const num = idx + 1;
    const pad = String(num).padStart(3, '0');
    const id = `client-syn-${pad}`;
    const createdAt = new Date(Date.UTC(2024, (num % 10), (num % 25) + 1, 9, 30, 0)).toISOString();
    const updatedAt = new Date(Date.UTC(2025, (num % 8), (num % 25) + 1, 14, 0, 0)).toISOString();

    return {
      id,
      firmId: SYNTHETIC_FIRM_ID,
      name: raw.name,
      nameBn: raw.nameBn,
      phone: `+880 1700-${raw.phoneSuffix}`,
      email: raw.email,
      address: raw.address,
      notes: raw.notes,
      archived: Boolean(raw.archived),
      createdAt,
      updatedAt,
      deletedAt: null,
      createdBy: num % 4 === 0 ? STAFF_USER_ID : OWNER_USER_ID,
      updatedBy: num % 4 === 0 ? STAFF_USER_ID : OWNER_USER_ID,
    };
  });

  // 2. Generate 110 Cases linked to clients
  // Clients 1-60 have 1 case each (60 cases)
  // Clients 61-80 have 2 cases each (40 cases)
  // Clients 81-83 have 3 cases each (9 cases)
  // Client 84 has 1 case (1 case)
  // Total = 60 + 40 + 9 + 1 = 110 cases.
  // Clients 85-90 (active) and 91-100 (archived) have 0 cases (testing clients with no cases).
  const caseDistributions: Array<{ clientId: string; caseCount: number }> = [];
  for (let i = 1; i <= 60; i++) {
    caseDistributions.push({ clientId: `client-syn-${String(i).padStart(3, '0')}`, caseCount: 1 });
  }
  for (let i = 61; i <= 80; i++) {
    caseDistributions.push({ clientId: `client-syn-${String(i).padStart(3, '0')}`, caseCount: 2 });
  }
  for (let i = 81; i <= 83; i++) {
    caseDistributions.push({ clientId: `client-syn-${String(i).padStart(3, '0')}`, caseCount: 3 });
  }
  caseDistributions.push({ clientId: 'client-syn-084', caseCount: 1 });

  const courts = [
    'Supreme Court of Bangladesh (High Court Division)',
    '1st Joint District Judge Court, Dhaka',
    '2nd Joint District Judge Court, Chattogram',
    'Dhaka District & Sessions Judge Court',
    'Artha Rin Adalat No. 1, Dhaka',
    'Artha Rin Adalat No. 2, Chattogram',
    'Metropolitan Sessions Judge Court, Dhaka',
    '1st Sub-Judge & Land Survey Tribunal, Sylhet',
    'Family Court, Dhaka',
    'Labour Court No. 1, Dhaka',
    'Chief Metropolitan Magistrate Court, Dhaka',
    'Senior Assistant Judge Court, Sadar, Rajshahi',
    'High Court Division (Company Bench)',
    'High Court Division (Writ Bench)',
  ];

  const civilMatters = [
    'Civil / Land Title Partition Suit',
    'Specific Performance of Contract',
    'Declaration of Title & Recovery of Khas Possession',
    'Permanent & Temporary Injunction (Order 39)',
    'Pre-emption under Section 96 SAT Act',
    'Revision under Section 115 CPC',
    'Commercial Debt Recovery under Order 37 CPC',
    'Probate & Succession Matter',
    'Land Survey BS Khatian Rectification',
    'Mortgage Redemption Suit',
  ];

  const criminalMatters = [
    'Cheque Dishonour under Section 138 Negotiable Instruments Act',
    'Criminal Revision under Section 439 CrPC',
    'Anticipatory Bail Application under Section 498 CrPC',
    'Special Criminal Case (Anti-Corruption)',
    'Criminal Appeal against Conviction under Section 410 CrPC',
  ];

  const otherMatters = [
    'Writ Petition under Article 102 of Constitution',
    'Corporate Commercial Dispute / Insolvency Petition',
    'Family Court Maintenance & Dower Suit',
    'Labour Court Industrial Dispute under Section 213',
    'Customs Valuation & Port Tariff Dispute',
  ];

  const cases: CaseRecord[] = [];
  let caseIndex = 1;

  for (const dist of caseDistributions) {
    const client = clients.find((c) => c.id === dist.clientId)!;
    for (let cNum = 1; cNum <= dist.caseCount; cNum++) {
      const caseId = `case-syn-${String(caseIndex).padStart(3, '0')}`;
      const fileSerial = `SYN-FS-${String(caseIndex).padStart(4, '0')}`;

      // Distribute categories:
      // 1-65: civil, 66-85: criminal_gr, 86-98: criminal_cr, 99-110: other
      let caseCategory: 'civil' | 'criminal_gr' | 'criminal_cr' | 'other' = 'civil';
      let matterType = civilMatters[caseIndex % civilMatters.length];
      let court = courts[caseIndex % courts.length];

      if (caseIndex >= 66 && caseIndex <= 85) {
        caseCategory = 'criminal_gr';
        matterType = criminalMatters[caseIndex % criminalMatters.length];
        court = caseIndex % 2 === 0 ? 'Metropolitan Sessions Judge Court, Dhaka' : 'Chief Metropolitan Magistrate Court, Dhaka';
      } else if (caseIndex >= 86 && caseIndex <= 98) {
        caseCategory = 'criminal_cr';
        matterType = criminalMatters[caseIndex % criminalMatters.length];
        court = 'Metropolitan Sessions Judge Court, Dhaka';
      } else if (caseIndex >= 99) {
        caseCategory = 'other';
        matterType = otherMatters[caseIndex % otherMatters.length];
        court = caseIndex % 2 === 0 ? 'Supreme Court of Bangladesh (High Court Division)' : 'Family Court, Dhaka';
      }

      // Statuses: 1-85 ongoing, 86-98 pending, 99-110 closed
      let status: 'ongoing' | 'pending' | 'closed' = 'ongoing';
      let closedOn: string | null = null;
      if (caseIndex >= 86 && caseIndex <= 98) {
        status = 'pending';
      } else if (caseIndex >= 99) {
        status = 'closed';
        closedOn = new Date(Date.UTC(2026, 4, 15, 12, 0, 0)).toISOString();
      }

      // Confidentiality: ~10 confidential cases (cases 10, 20, 30, 40, 50, 60, 70, 80, 90, 100)
      const restricted = caseIndex % 10 === 0;

      const caseYear = 2023 + (caseIndex % 3);
      const caseNumber = `${matterType.split(' ')[0]} No. ${((caseIndex * 17) % 350) + 1}/${caseYear}`;
      const nextHearingDate = status === 'closed'
        ? null
        : new Date(Date.UTC(2026, 9 + ((caseIndex % 3)), (caseIndex % 25) + 1, 4, 30, 0)).toISOString();

      cases.push({
        id: caseId,
        firmId: SYNTHETIC_FIRM_ID,
        clientId: client.id,
        fileSerial,
        caseNumber,
        court,
        matterType,
        description: `Synthetic legal practice matter concerning ${matterType.toLowerCase()} on behalf of ${client.name}.`,
        plaintiff: caseCategory.startsWith('criminal') ? 'The State' : client.name,
        defendant: caseCategory.startsWith('criminal') ? client.name : `Opposite Party & Others (${caseIndex})`,
        partyARole: caseCategory.startsWith('criminal') ? 'Prosecution' : 'Plaintiff',
        partyBRole: caseCategory.startsWith('criminal') ? 'Accused' : 'Defendant',
        ourRole: caseCategory.startsWith('criminal') ? 'Defence counsel' : 'Plaintiff',
        plaintiffLawyer: caseIndex % 2 === 0 ? OWNER_USER_NAME : STAFF_USER_NAME,
        defendantLawyer: `Adv. Enamul Karim (${caseIndex})`,
        responsibleLawyerId: STAFF_USER_ID,
        status,
        caseCategory,
        caseDate: new Date(Date.UTC(caseYear, (caseIndex % 11), 10)).toISOString().slice(0, 10),
        closedOn,
        policeStation: caseCategory.startsWith('criminal') ? 'Motijheel Police Station' : null,
        sectionsOfLaw: caseCategory.startsWith('criminal') ? 'Section 138 Negotiable Instruments Act 1881' : 'Section 54 Specific Relief Act 1877',
        restricted,
        nextHearingAt: nextHearingDate,
        createdAt: new Date(Date.UTC(2024, (caseIndex % 11), 12, 10, 0, 0)).toISOString(),
        updatedAt: new Date(Date.UTC(2026, (caseIndex % 8), 15, 14, 0, 0)).toISOString(),
        deletedAt: null,
        createdBy: caseIndex % 3 === 0 ? STAFF_USER_ID : OWNER_USER_ID,
        updatedBy: caseIndex % 3 === 0 ? STAFF_USER_ID : OWNER_USER_ID,
      });

      caseIndex++;
    }
  }

  // 3. Generate 180 Hearings linked to cases
  const hearings: HearingRecord[] = [];
  const hearingDateHistory: HearingDateHistoryRecord[] = [];
  let historyIndex = 1;

  const hearingPurposes = [
    'Cross Examination of Plaintiff Witness 1 (PW-1)',
    'Cross Examination of Defendant Witness 1 (DW-1)',
    'Hearing on Injunction Application under Order 39 Rules 1 & 2 CPC',
    'Submission of Written Statement by Opposite Party',
    'Framing of Issues under Order 14 CPC',
    'Charge Framing Hearing under Section 241A CrPC',
    'Final Argument under Section 115 CPC Revision',
    'Mediation / Sullahnama Compromise Discussion',
    'Hearing on Lower Court Records (LCR) Verification',
    'Pronouncement of Judgment & Decree',
    'Filing of Show-Cause Reply by Government Respondent',
    'Examination-in-Chief of Independent Handwriting Expert',
  ];

  const fixedForLabels = [
    'PW Deposition',
    'DW Cross',
    'Argument',
    'Written Statement',
    'Injunction Hearing',
    'Charge Framing',
    'Judgment',
    'Mediation',
  ];

  for (let hIndex = 1; hIndex <= 180; hIndex++) {
    const targetCase = cases[(hIndex - 1) % cases.length];
    const hearingId = `hearing-syn-${String(hIndex).padStart(3, '0')}`;
    const purpose = hearingPurposes[hIndex % hearingPurposes.length];
    const fixedFor = fixedForLabels[hIndex % fixedForLabels.length];

    // Status:
    // 1-90: scheduled (future dates)
    // 91-125: held (past dates)
    // 126-170: adjourned (45 records with hearing date history)
    // 171-180: cancelled
    let status: 'scheduled' | 'held' | 'adjourned' | 'cancelled' = 'scheduled';
    let scheduledDate: Date;

    if (hIndex <= 90) {
      status = 'scheduled';
      // Future dates between Nov 2026 and Dec 2026
      scheduledDate = new Date(Date.UTC(2026, 10 + (hIndex % 2), (hIndex % 25) + 1, 4, 30, 0));
    } else if (hIndex <= 125) {
      status = 'held';
      // Past dates early 2026
      scheduledDate = new Date(Date.UTC(2026, 1 + (hIndex % 6), (hIndex % 25) + 1, 4, 30, 0));
    } else if (hIndex <= 170) {
      status = 'adjourned';
      // Recent past dates
      scheduledDate = new Date(Date.UTC(2026, 7 + (hIndex % 2), (hIndex % 25) + 1, 4, 30, 0));
    } else {
      status = 'cancelled';
      scheduledDate = new Date(Date.UTC(2026, 5, (hIndex % 20) + 1, 5, 0, 0));
    }

    const hearingRecord: HearingRecord = {
      id: hearingId,
      firmId: SYNTHETIC_FIRM_ID,
      caseId: targetCase.id,
      appearingLawyerId: hIndex % 2 === 0 ? STAFF_USER_ID : OWNER_USER_ID,
      scheduledAt: scheduledDate.toISOString(),
      court: targetCase.court,
      purpose,
      status,
      outcomeNote: status === 'held'
        ? `Step concluded successfully: ${purpose}. Next date fixed for further proceedings.`
        : status === 'adjourned'
        ? 'Time petition filed by opposite counsel; court granted adjournment upon payment of cost.'
        : status === 'cancelled'
        ? 'Cancelled due to national holiday declared by government.'
        : 'Notice and cause list verified; ready for hearing.',
      fixedFor,
      fixedForNote: `Next step note for ${fixedFor}`,
      createdAt: targetCase.createdAt,
      updatedAt: new Date(Date.UTC(2026, 8, 1, 10, 0, 0)).toISOString(),
      deletedAt: null,
      createdBy: OWNER_USER_ID,
      updatedBy: OWNER_USER_ID,
    };
    hearings.push(hearingRecord);

    // Create 45 Hearing Date History entries for adjourned hearings
    if (status === 'adjourned' && historyIndex <= 45) {
      const oldDate = new Date(scheduledDate.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString();
      hearingDateHistory.push({
        id: `hist-syn-${String(historyIndex).padStart(3, '0')}`,
        firmId: SYNTHETIC_FIRM_ID,
        hearingId: hearingRecord.id,
        caseId: targetCase.id,
        oldAt: oldDate,
        newAt: hearingRecord.scheduledAt,
        reason: historyIndex % 3 === 0
          ? 'Time petition (Sullah/Hazira) moved by Opposite Party stating senior counsel ill'
          : historyIndex % 3 === 1
          ? 'Presiding Judge on administrative inspection duty; cause list adjourned en bloc'
          : 'Both parties jointly requested date for out-of-court family compromise discussions',
        oldFixedFor: 'PW-1 Cross',
        newFixedFor: fixedFor,
        changedBy: OWNER_USER_ID,
        changedByName: OWNER_USER_NAME,
        changedAt: new Date(Date.UTC(2026, 8, (historyIndex % 25) + 1, 6, 30, 0)).toISOString(),
      });
      historyIndex++;
    }
  }

  // 4. Generate 120 Tasks
  const taskTitles = [
    'Procure certified carbon copy of CS/RS Porcha from Collectorate',
    'Draft and serve legal notice under Section 138 Negotiable Instruments Act',
    'Prepare written statement and counter-claim under Order 8 CPC',
    'Draft questionnaire for cross-examination of Plaintiff witness DW-1',
    'File formal application under Order 39 Rule 1 CPC for temporary injunction',
    'Inspect Lower Court Records (LCR) in High Court Division Section',
    'Collate bank statement records and deposit slip receipts for LC claim',
    'Draft petition for cancellation of bail under Section 497(5) CrPC',
    'Prepare draft compromise deed (Sullahnama) as agreed between parties',
    'Submit process fee and requisites for summons service upon opposite parties',
    'Prepare written argument citing relevant decisions of 45 DLR and 18 BLC',
    'Coordinate with client for production of original registered partition deed',
  ];

  const tasks: TaskRecord[] = [];
  for (let tIndex = 1; tIndex <= 120; tIndex++) {
    const targetCase = cases[(tIndex - 1) % cases.length];
    const taskId = `task-syn-${String(tIndex).padStart(3, '0')}`;
    const title = taskTitles[tIndex % taskTitles.length];

    // Priority: urgent (15), high (30), medium (45), normal (20), low (10)
    let priority: 'urgent' | 'high' | 'medium' | 'normal' | 'low' = 'normal';
    if (tIndex <= 15) priority = 'urgent';
    else if (tIndex <= 45) priority = 'high';
    else if (tIndex <= 90) priority = 'medium';
    else if (tIndex <= 110) priority = 'normal';
    else priority = 'low';

    // Status: pending (60), in_progress (30), completed (25), cancelled (5)
    let status: 'pending' | 'in_progress' | 'completed' | 'cancelled' = 'pending';
    let completedAt: string | null = null;
    if (tIndex <= 60) {
      status = 'pending';
    } else if (tIndex <= 90) {
      status = 'in_progress';
    } else if (tIndex <= 115) {
      status = 'completed';
      completedAt = new Date(Date.UTC(2026, 7, (tIndex % 25) + 1, 14, 0, 0)).toISOString();
    } else {
      status = 'cancelled';
    }

    const assignedTo = tIndex % 2 === 0 ? STAFF_USER_ID : OWNER_USER_ID;
    const assignedToName = tIndex % 2 === 0 ? STAFF_USER_NAME : OWNER_USER_NAME;
    const dueAt = new Date(Date.UTC(2026, 9 + (tIndex % 3), (tIndex % 28) + 1, 12, 0, 0)).toISOString();

    tasks.push({
      id: taskId,
      firmId: SYNTHETIC_FIRM_ID,
      caseId: targetCase.id,
      clientId: targetCase.clientId,
      assignedTo,
      assignedToName,
      title,
      description: `Task execution note regarding ${title.toLowerCase()} for ${targetCase.caseNumber}.`,
      priority,
      dueAt,
      status,
      completedAt,
      createdAt: new Date(Date.UTC(2024, 2, (tIndex % 25) + 1, 9, 0, 0)).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 8, (tIndex % 25) + 1, 10, 0, 0)).toISOString(),
      deletedAt: null,
      createdBy: OWNER_USER_ID,
      updatedBy: assignedTo,
    });
  }

  // 5. Generate 140 Client Notes
  const noteBodies = [
    'Client visited chamber for initial briefing; provided photostat copies of ancestral khatian and sale deeds.',
    'Telephonic discussion with client regarding next hearing date and witness readiness for court cross-examination.',
    'Client informed that opposite parties approached local union parishad chairman for informal compromise.',
    'Scrutinized original registry deeds; observed boundary discrepancy between RS and BS survey maps.',
    'Client requested urgent filing of ad-interim temporary injunction to restrain construction on disputed property.',
    'Received legal notice reply from opposite counsel; claims complete denial of our client\'s possession.',
    'Consulted senior advocate on constitutional writ jurisdiction questions regarding arbitrary government acquisition.',
    'Client paid court fees and process fee requisites in cash at chamber desk.',
    'Follow-up communication regarding certified copies receipt from District Judge copying department.',
    'Chamber meeting held with junior advocate and client to rehearse witness examination questions.',
  ];

  const clientNotes: ClientNoteRecord[] = [];
  for (let cnIndex = 1; cnIndex <= 140; cnIndex++) {
    const targetClient = clients[(cnIndex - 1) % clients.length];
    const noteId = `cnote-syn-${String(cnIndex).padStart(3, '0')}`;
    const body = `${noteBodies[cnIndex % noteBodies.length]} (Matter Ref: Client Dossier #${targetClient.id}).`;
    const noteDate = new Date(Date.UTC(2025, (cnIndex % 11), (cnIndex % 28) + 1)).toISOString().slice(0, 10);

    clientNotes.push({
      id: noteId,
      firmId: SYNTHETIC_FIRM_ID,
      clientId: targetClient.id,
      noteDate,
      body,
      createdAt: new Date(Date.UTC(2025, (cnIndex % 11), (cnIndex % 28) + 1, 11, 0, 0)).toISOString(),
      updatedAt: new Date(Date.UTC(2025, (cnIndex % 11), (cnIndex % 28) + 1, 11, 0, 0)).toISOString(),
      deletedAt: null,
      createdBy: cnIndex % 3 === 0 ? STAFF_USER_ID : OWNER_USER_ID,
      updatedBy: cnIndex % 3 === 0 ? STAFF_USER_ID : OWNER_USER_ID,
    });
  }

  // 6. Generate 65 Appointments
  const apptTitles = [
    'Case Strategy Consultation with Lead Advocate',
    'Chamber Conference on Partition Deed Review',
    'Telephonic Pre-Hearing Briefing',
    'Review of High Court Written Submission Draft',
    'Witness Examination Preparation & Mock Rehearsal',
    'Client Meeting: Discussion on Out-of-Court Settlement Terms',
    'Quarterly Corporate Legal Advisory Briefing',
  ];

  const apptTypes: Array<'client_meeting' | 'consultation' | 'phone_call' | 'internal_meeting' | 'court_visit' | 'other'> = [
    'consultation',
    'client_meeting',
    'phone_call',
    'internal_meeting',
    'client_meeting',
    'consultation',
    'court_visit',
  ];

  const appointments: AppointmentRecord[] = [];
  const appointmentAttendees: AppointmentAttendeeRecord[] = [];

  for (let aIndex = 1; aIndex <= 65; aIndex++) {
    const targetCase = cases[(aIndex - 1) % cases.length];
    const apptId = `appt-syn-${String(aIndex).padStart(3, '0')}`;
    const type = apptTypes[aIndex % apptTypes.length];
    const mode = aIndex % 3 === 0 ? 'video' : aIndex % 3 === 1 ? 'phone' : 'in_person';

    let status: 'scheduled' | 'completed' | 'cancelled' | 'no_show' = 'scheduled';
    if (aIndex <= 45) status = 'scheduled';
    else if (aIndex <= 60) status = 'completed';
    else if (aIndex <= 63) status = 'cancelled';
    else status = 'no_show';

    const startH = 10 + (aIndex % 6);
    const startDate = new Date(Date.UTC(2026, 10 + (aIndex % 2), (aIndex % 25) + 1, startH, 0, 0));
    const endDate = new Date(Date.UTC(2026, 10 + (aIndex % 2), (aIndex % 25) + 1, startH + 1, 0, 0));

    appointments.push({
      id: apptId,
      firmId: SYNTHETIC_FIRM_ID,
      title: `${apptTitles[aIndex % apptTitles.length]} - ${targetCase.caseNumber}`,
      type,
      startsAt: startDate.toISOString(),
      endsAt: endDate.toISOString(),
      mode,
      location: mode === 'in_person' ? 'Chamber Conference Room A, Supreme Court Bar Building' : null,
      organiserUserId: OWNER_USER_ID,
      clientId: targetCase.clientId,
      caseId: targetCase.id,
      status,
      notes: `Appointment note for ${targetCase.caseNumber}. Remind client to bring original land records and photo ID.`,
      reminderMinutesBefore: aIndex % 2 === 0 ? 30 : 60,
      attendees: [OWNER_USER_ID, STAFF_USER_ID],
      createdAt: new Date(Date.UTC(2025, 4, 10, 10, 0, 0)).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 8, 1, 12, 0, 0)).toISOString(),
      deletedAt: null,
      createdBy: OWNER_USER_ID,
      updatedBy: OWNER_USER_ID,
    });

    appointmentAttendees.push(
      {
        id: `att-syn-${String(aIndex * 2 - 1).padStart(3, '0')}`,
        appointmentId: apptId,
        userId: OWNER_USER_ID,
        firmId: SYNTHETIC_FIRM_ID,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `att-syn-${String(aIndex * 2).padStart(3, '0')}`,
        appointmentId: apptId,
        userId: STAFF_USER_ID,
        firmId: SYNTHETIC_FIRM_ID,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    );
  }

  // 7. Generate 140 Billing Records
  // - 50 Fee Agreements
  // - 60 Fee Payments
  // - 30 Expenses
  const feeAgreements: FeeAgreement[] = [];
  const feeTypes: Array<'fixed' | 'per_hearing' | 'retainer' | 'installment'> = [
    'fixed',
    'per_hearing',
    'retainer',
    'installment',
  ];

  for (let faIndex = 1; faIndex <= 50; faIndex++) {
    const targetCase = cases[(faIndex - 1) % cases.length];
    const faId = `fa-syn-${String(faIndex).padStart(3, '0')}`;
    const feeType = feeTypes[faIndex % feeTypes.length];
    // Amounts between BDT 25,000 and BDT 350,000 (represented strictly in Paisa = 1/100 BDT)
    const agreedTaka = 25000 + (faIndex * 6500);
    const agreedAmountPaisa = agreedTaka * 100;

    feeAgreements.push({
      id: faId,
      firmId: SYNTHETIC_FIRM_ID,
      clientId: targetCase.clientId,
      caseId: targetCase.id,
      feeType,
      agreedAmountPaisa,
      agreementDate: new Date(Date.UTC(2024, (faIndex % 11), 15)).toISOString().slice(0, 10),
      notes: `Fee agreement concluded with client for ${targetCase.caseNumber} on ${feeType} basis.`,
      status: faIndex > 42 ? 'closed' : 'active',
      createdAt: new Date(Date.UTC(2024, (faIndex % 11), 15, 10, 0, 0)).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 2, 10, 14, 0, 0)).toISOString(),
      deletedAt: null,
      createdBy: OWNER_USER_ID,
      updatedBy: OWNER_USER_ID,
    });
  }

  const feePayments: FeePayment[] = [];
  const paymentMethods: Array<'cash' | 'bank' | 'bkash' | 'nagad' | 'cheque'> = [
    'bank',
    'bkash',
    'cash',
    'cheque',
    'nagad',
  ];

  for (let fpIndex = 1; fpIndex <= 60; fpIndex++) {
    const agreement = feeAgreements[(fpIndex - 1) % feeAgreements.length];
    const fpId = `fp-syn-${String(fpIndex).padStart(3, '0')}`;
    const method = paymentMethods[fpIndex % paymentMethods.length];
    const receiptNumber = `SYN-RCP-${String(fpIndex).padStart(4, '0')}`;
    const idempotencyKey = `syn-idem-fp-${String(fpIndex).padStart(4, '0')}`;

    // Payment amounts: partial or full payment of agreement
    const amountTaka = 15000 + (fpIndex * 2500);
    const amountPaisa = amountTaka * 100;
    const isVoid = fpIndex % 15 === 0;

    feePayments.push({
      id: fpId,
      firmId: SYNTHETIC_FIRM_ID,
      clientId: agreement.clientId,
      caseId: agreement.caseId,
      feeAgreementId: agreement.id,
      hearingId: null,
      paymentDate: new Date(Date.UTC(2025, (fpIndex % 11), (fpIndex % 28) + 1)).toISOString().slice(0, 10),
      amountPaisa,
      method,
      reference: method === 'bkash' ? `TrxID-BK${fpIndex * 8923}` : method === 'cheque' ? `CQ-${100000 + fpIndex}` : `Ref-${fpIndex}`,
      receiptNumber,
      purposeNote: `Chamber fee installment received for matter ${agreement.caseId} via ${method}.`,
      status: isVoid ? 'void' : 'posted',
      voidReason: isVoid ? 'Accidental duplicate entry cancelled by accounts clerk' : null,
      voidedBy: isVoid ? OWNER_USER_ID : null,
      voidedAt: isVoid ? new Date(Date.UTC(2025, 8, 20, 14, 0, 0)).toISOString() : null,
      idempotencyKey,
      legacyUnassigned: false,
      createdAt: new Date(Date.UTC(2025, (fpIndex % 11), (fpIndex % 28) + 1, 14, 0, 0)).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 2, 1, 10, 0, 0)).toISOString(),
      deletedAt: null,
      createdBy: OWNER_USER_ID,
      updatedBy: OWNER_USER_ID,
    });
  }

  const expenses: Expense[] = [];
  const expenseDescriptions = [
    'Supreme Court Court-fees and advocate welfare stamps purchase',
    'Process Server notice service charges for summoning defendants',
    'Certified copy urgent requisition fees from trial court record room',
    'Special non-judicial stamp duty for agreement execution',
    'Travel and conveyance for court appearance in Chattogram District Court',
    'Photocopying, brief typing, and binding charges for 4 volume paper book',
  ];
  const expenseCategories = ['Court Fees', 'Process Server / Notice', 'Certified Copy', 'Stamp Duty', 'Travel / Conveyance', 'Photocopy & Typing'];

  for (let expIndex = 1; expIndex <= 30; expIndex++) {
    const targetCase = cases[(expIndex - 1) % cases.length];
    const expId = `exp-syn-${String(expIndex).padStart(3, '0')}`;
    const expTaka = 800 + (expIndex * 450);
    const amountPaisa = expTaka * 100;
    const catName = expenseCategories[expIndex % expenseCategories.length];

    expenses.push({
      id: expId,
      firmId: SYNTHETIC_FIRM_ID,
      clientId: targetCase.clientId,
      caseId: targetCase.id,
      categoryId: `cat-${expIndex % expenseCategories.length}`,
      categoryName: catName,
      expenseDate: new Date(Date.UTC(2025, (expIndex % 11), (expIndex % 25) + 1)).toISOString().slice(0, 10),
      amountPaisa,
      description: `${expenseDescriptions[expIndex % expenseDescriptions.length]} (${targetCase.caseNumber}).`,
      reimbursable: expIndex % 5 !== 0,
      status: 'posted',
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      createdAt: new Date(Date.UTC(2025, (expIndex % 11), (expIndex % 25) + 1, 16, 0, 0)).toISOString(),
      updatedAt: new Date(Date.UTC(2025, (expIndex % 11), (expIndex % 25) + 1, 16, 0, 0)).toISOString(),
      deletedAt: null,
      createdBy: OWNER_USER_ID,
      updatedBy: OWNER_USER_ID,
    });
  }

  // 8. Generate 50 Physical Files & 20 Movements for Mock Store
  const physicalFiles: PhysicalFileRecord[] = [];
  const fileMovements: FileMovementRecord[] = [];

  const shelfLocations = [
    'Cabinet A, Shelf 1',
    'Cabinet A, Shelf 2',
    'Cabinet B, Shelf 1',
    'Cabinet B, Shelf 3',
    'Cabinet C, Shelf 2',
    'Senior Partner Safe Box',
  ];

  for (let fIndex = 1; fIndex <= 50; fIndex++) {
    const targetCase = cases[(fIndex - 1) % cases.length];
    const fileId = `file-syn-${String(fIndex).padStart(3, '0')}`;
    const serial = `F-SYN-${String(fIndex).padStart(4, '0')}`;

    let status: 'in_chamber' | 'checked_out' | 'in_court' | 'archived' = 'in_chamber';
    let currentHolderId: string | null = null;
    let currentHolderName: string | null = null;
    let checkedOutAt: string | null = null;
    let dueBackAt: string | null = null;

    if (fIndex <= 30) {
      status = 'in_chamber';
    } else if (fIndex <= 42) {
      status = 'checked_out';
      currentHolderId = STAFF_USER_ID;
      currentHolderName = STAFF_USER_NAME;
      checkedOutAt = new Date(Date.UTC(2026, 9, 20, 9, 0, 0)).toISOString();
      dueBackAt = new Date(Date.UTC(2026, 9, 28, 17, 0, 0)).toISOString();
    } else if (fIndex <= 47) {
      status = 'in_court';
      currentHolderId = OWNER_USER_ID;
      currentHolderName = OWNER_USER_NAME;
      checkedOutAt = new Date(Date.UTC(2026, 9, 25, 8, 30, 0)).toISOString();
      dueBackAt = new Date(Date.UTC(2026, 10, 5, 17, 0, 0)).toISOString();
    } else {
      status = 'archived';
    }

    physicalFiles.push({
      id: fileId,
      firmId: SYNTHETIC_FIRM_ID,
      serial,
      caseId: targetCase.id,
      clientId: targetCase.clientId,
      title: `${targetCase.caseNumber} - Physical File Bundle (${targetCase.matterType.slice(0, 30)})`,
      shelfLocation: shelfLocations[fIndex % shelfLocations.length],
      status,
      currentHolderId,
      currentHolderName,
      checkedOutAt,
      dueBackAt,
      notes: `Original case brief, certified court orders, and client vakalatnama records.`,
      createdAt: targetCase.createdAt,
      updatedAt: new Date(Date.UTC(2026, 8, 1, 10, 0, 0)).toISOString(),
      deletedAt: null,
      createdBy: OWNER_USER_ID,
      updatedBy: OWNER_USER_ID,
    });

    if (fIndex <= 20) {
      fileMovements.push({
        id: `mov-syn-${String(fIndex).padStart(3, '0')}`,
        firmId: SYNTHETIC_FIRM_ID,
        fileId,
        action: fIndex % 2 === 0 ? 'CHECKOUT' : 'COURT_DISPATCH',
        userId: fIndex % 2 === 0 ? STAFF_USER_ID : OWNER_USER_ID,
        userName: fIndex % 2 === 0 ? STAFF_USER_NAME : OWNER_USER_NAME,
        at: new Date(Date.UTC(2026, 9, 20, 9, 0, 0)).toISOString(),
        dueBackAt: new Date(Date.UTC(2026, 9, 28, 17, 0, 0)).toISOString(),
        note: `Dispatched for hearing preparation in ${targetCase.court}.`,
      });
    }
  }

  cachedDataset = {
    clients,
    cases,
    hearings,
    hearingDateHistory,
    tasks,
    clientNotes,
    appointments,
    appointmentAttendees,
    feeAgreements,
    feePayments,
    expenses,
    physicalFiles,
    fileMovements,
  };

  return cachedDataset;
}
