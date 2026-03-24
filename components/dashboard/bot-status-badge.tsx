'use client';

import { Badge } from '../ui/badge';
import type { BotStatus } from '@/lib/types';

interface BotStatusBadgeProps {
  status: BotStatus;
}

export function BotStatusBadge({ status }: BotStatusBadgeProps) {
  const variant =
    status.status === 'active'
      ? 'green'
      : status.status === 'error'
        ? 'red'
        : 'yellow';

  const label =
    status.status === 'active'
      ? 'Bot Active'
      : status.status === 'error'
        ? 'Bot Error'
        : 'Bot Idle';

  return <Badge label={label} variant={variant} pulse={status.status === 'active'} />;
}
