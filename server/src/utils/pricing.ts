export interface PricingBreakdown {
  basePriceBdt: number;
  includedUsers: number;
  maxUsers: number;
  extraUsersCount: number;
  extraUserPriceBdt: number;
  extraUsersCostBdt: number;
  includedDevices: number;
  maxDevices: number;
  extraDevicesCount: number;
  extraDevicePriceBdt: number;
  extraDevicesCostBdt: number;
  monthlyPriceBdt: number;
}

export function calculateMonthlyPriceBdt(
  plan: {
    priceBdt: number;
    seats?: number | null;
    includedUsers?: number | null;
    includedDevices?: number | null;
    extraUserPriceBdt?: number | null;
    extraDevicePriceBdt?: number | null;
  },
  firm: {
    maxUsers?: number | null;
    maxDevices?: number | null;
  }
): PricingBreakdown {
  const basePriceBdt = Math.round(plan.priceBdt || 0);
  const includedUsers = plan.includedUsers ?? plan.seats ?? 0;
  const includedDevices = plan.includedDevices ?? 0;
  const extraUserPriceBdt = plan.extraUserPriceBdt ?? 100;
  const extraDevicePriceBdt = plan.extraDevicePriceBdt ?? 100;

  const firmMaxUsers = firm.maxUsers ?? includedUsers;
  const firmMaxDevices = firm.maxDevices ?? includedDevices;

  const extraUsersCount = Math.max(0, firmMaxUsers - includedUsers);
  const extraDevicesCount = Math.max(0, firmMaxDevices - includedDevices);

  const extraUsersCostBdt = Math.round(extraUsersCount * extraUserPriceBdt);
  const extraDevicesCostBdt = Math.round(extraDevicesCount * extraDevicePriceBdt);

  const monthlyPriceBdt = basePriceBdt + extraUsersCostBdt + extraDevicesCostBdt;

  return {
    basePriceBdt,
    includedUsers,
    maxUsers: firmMaxUsers,
    extraUsersCount,
    extraUserPriceBdt,
    extraUsersCostBdt,
    includedDevices,
    maxDevices: firmMaxDevices,
    extraDevicesCount,
    extraDevicePriceBdt,
    extraDevicesCostBdt,
    monthlyPriceBdt,
  };
}
