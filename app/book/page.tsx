import { BookingWizard } from '@/components/booking/BookingWizard';

export default function BookPage() {
  return <><nav className="bg-ocean-950 px-4 py-3 text-center text-sm text-white"><a className="underline underline-offset-4" href="/book/sessions">Looking for family, individual or company photography? Book a photo session →</a></nav><BookingWizard /></>;
}
