import React from 'react';
import { MattersBillingLedger } from './MattersBillingLedger';

interface BillingTabProps {
  clientId: string;
  caseId?: string | null;
}

export const BillingTab: React.FC<BillingTabProps> = ({ clientId, caseId }) => {
  return <MattersBillingLedger clientId={clientId} caseId={caseId ?? null} />;
};
