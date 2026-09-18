'use client';

import { WorkshopView } from './workshop-view';
import { SessionRequired, useCurrentSession } from './session-required';

export function WorkshopRouteView() {
  const session = useCurrentSession();
  if (!session) return <SessionRequired session={session} />;
  return <WorkshopView />;
}
