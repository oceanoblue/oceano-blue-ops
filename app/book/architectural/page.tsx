import { BookingWizard } from '@/components/booking/BookingWizard';

export const metadata = {
  title: 'Book Architectural Photography · Oceano Blue Media',
};

export default function BookArchitecturalPage() {
  return <BookingWizard audience="architectural" label="Architectural & Construction" />;
}
