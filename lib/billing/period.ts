import { localToUtc, fmtDateInTz } from '@/lib/utils/timezone';
export function reportPeriod(input?: string) {
  const month=input&&/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(input)?input:fmtDateInTz(new Date(),'America/New_York','iso').slice(0,7);
  const [y,m]=month.split('-').map(Number);
  const next=`${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}-01`;
  return {month,start:localToUtc(`${month}-01`,'00:00','America/New_York').toISOString(),end:localToUtc(next,'00:00','America/New_York').toISOString()};
}
