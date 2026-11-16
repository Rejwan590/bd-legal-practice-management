export type BillingCycle = 'monthly' | 'annual';

export interface PlanPricingInput {
  id?: string;
  name?: string;
  priceBdt: number;
  seats?: number | null;
  includedUsers?: number | null;
  includedDevices?: number | null;
  extraUserPriceBdt?: number | null;
  extraDevicePriceBdt?: number | null;
  durationMonths?: number | null;
}

export interface FirmPricingInput {
  billingCycle?: BillingCycle | string | null;
  customBasePriceBdt?: number | null;
  customAnnualPriceBdt?: number | null;
  customExtraUserPriceBdt?: number | null;
  customExtraDevicePriceBdt?: number | null;
  maxUsers?: number | null;
  maxDevices?: number | null;
  priceLockedUntil?: Date | string | null;
  pricingNote?: string | null;
}

export interface PricingBreakdown {
  // Plan Defaults
  planBasePriceBdt: number;
  planExtraUserPriceBdt: number;
  planExtraDevicePriceBdt: number;
  includedUsers: number;
  includedDevices: number;

  // Custom Overrides (null if using plan default)
  customBasePriceBdt: number | null;
  customAnnualPriceBdt: number | null;
  customExtraUserPriceBdt: number | null;
  customExtraDevicePriceBdt: number | null;

  // Effective Values
  effectiveBasePriceBdt: number;
  effectiveExtraUserPriceBdt: number;
  effectiveExtraDevicePriceBdt: number;

  // Firm Limits and Extra Counts
  maxUsers: number;
  maxDevices: number;
  extraUsersCount: number;
  extraDevicesCount: number;

  // Costs
  extraUsersCostBdt: number;
  extraDevicesCostBdt: number;

  // Totals & Terms
  monthlyTotal: number;
  annualTotal: number;
  termTotal: number;
  billingCycle: BillingCycle;
  unit: '/ month' | '/ year';

  // Backward compatibility fields
  basePriceBdt: number;
  extraUserPriceBdt: number;
  extraDevicePriceBdt: number;
  monthlyPriceBdt: number;
}

function validateIntegerPrice(val: number | null | undefined, name: string): void {
  if (val === null || val === undefined) return;
  if (typeof val !== 'number' || !Number.isFinite(val) || !Number.isInteger(val)) {
    throw new Error(`${name} must be an integer`);
  }
  if (val < 0) {
    throw new Error(`${name} cannot be negative`);
  }
}

export function calculatePricing(
  plan: PlanPricingInput,
  firm?: FirmPricingInput | null
): PricingBreakdown {
  validateIntegerPrice(plan.priceBdt, 'Plan base price');
  validateIntegerPrice(plan.extraUserPriceBdt, 'Plan extra user price');
  validateIntegerPrice(plan.extraDevicePriceBdt, 'Plan extra device price');

  const customBase = firm?.customBasePriceBdt;
  const customAnnual = firm?.customAnnualPriceBdt;
  const customExtraUser = firm?.customExtraUserPriceBdt;
  const customExtraDevice = firm?.customExtraDevicePriceBdt;

  validateIntegerPrice(customBase, 'Custom base price');
  validateIntegerPrice(customAnnual, 'Custom annual price');
  validateIntegerPrice(customExtraUser, 'Custom extra user price');
  validateIntegerPrice(customExtraDevice, 'Custom extra device price');

  const planBasePriceBdt = Math.round(plan.priceBdt || 0);
  const planExtraUserPriceBdt = plan.extraUserPriceBdt ?? 100;
  const planExtraDevicePriceBdt = plan.extraDevicePriceBdt ?? 100;
  const includedUsers = plan.includedUsers ?? plan.seats ?? 0;
  const includedDevices = plan.includedDevices ?? 0;

  const effectiveBasePriceBdt = customBase !== null && customBase !== undefined ? customBase : planBasePriceBdt;
  const effectiveExtraUserPriceBdt = customExtraUser !== null && customExtraUser !== undefined ? customExtraUser : planExtraUserPriceBdt;
  const effectiveExtraDevicePriceBdt = customExtraDevice !== null && customExtraDevice !== undefined ? customExtraDevice : planExtraDevicePriceBdt;

  const firmMaxUsers = firm?.maxUsers ?? includedUsers;
  const firmMaxDevices = firm?.maxDevices ?? includedDevices;

  const extraUsersCount = Math.max(0, firmMaxUsers - includedUsers);
  const extraDevicesCount = Math.max(0, firmMaxDevices - includedDevices);

  const extraUsersCostBdt = extraUsersCount * effectiveExtraUserPriceBdt;
  const extraDevicesCostBdt = extraDevicesCount * effectiveExtraDevicePriceBdt;

  const monthlyTotal = effectiveBasePriceBdt + extraUsersCostBdt + extraDevicesCostBdt;

  const annualTotal = customAnnual !== null && customAnnual !== undefined
    ? customAnnual
    : monthlyTotal * 10;

  const billingCycle: BillingCycle = firm?.billingCycle === 'annual' ? 'annual' : 'monthly';
  const termTotal = billingCycle === 'annual' ? annualTotal : monthlyTotal;
  const unit: '/ month' | '/ year' = billingCycle === 'annual' ? '/ year' : '/ month';

  return {
    planBasePriceBdt,
    planExtraUserPriceBdt,
    planExtraDevicePriceBdt,
    includedUsers,
    includedDevices,

    customBasePriceBdt: customBase !== null && customBase !== undefined ? customBase : null,
    customAnnualPriceBdt: customAnnual !== null && customAnnual !== undefined ? customAnnual : null,
    customExtraUserPriceBdt: customExtraUser !== null && customExtraUser !== undefined ? customExtraUser : null,
    customExtraDevicePriceBdt: customExtraDevice !== null && customExtraDevice !== undefined ? customExtraDevice : null,

    effectiveBasePriceBdt,
    effectiveExtraUserPriceBdt,
    effectiveExtraDevicePriceBdt,

    maxUsers: firmMaxUsers,
    maxDevices: firmMaxDevices,
    extraUsersCount,
    extraDevicesCount,

    extraUsersCostBdt,
    extraDevicesCostBdt,

    monthlyTotal,
    annualTotal,
    termTotal,
    billingCycle,
    unit,

    // Backward compatibility
    basePriceBdt: effectiveBasePriceBdt,
    extraUserPriceBdt: effectiveExtraUserPriceBdt,
    extraDevicePriceBdt: effectiveExtraDevicePriceBdt,
    monthlyPriceBdt: monthlyTotal,
  };
}

export function calculateMonthlyPriceBdt(
  plan: PlanPricingInput,
  firm?: FirmPricingInput | null
): PricingBreakdown {
  return calculatePricing(plan, firm);
}
