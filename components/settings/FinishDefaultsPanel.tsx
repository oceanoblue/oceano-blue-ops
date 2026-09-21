'use client';
import { useState } from 'react';
import { FinishControls } from '@/components/photos/FinishControls';
import { DEFAULT_FINISH } from '@/lib/ai/finishing';

export function FinishDefaultsPanel() {
  const [finish, setFinish] = useState(DEFAULT_FINISH);
  return <FinishControls value={finish} onChange={setFinish} />;
}
