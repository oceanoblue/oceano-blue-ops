import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card p-12 text-center">
      <h1 className="text-xl font-semibold">Order not found</h1>
      <Link href="/dashboard/orders" className="btn-secondary mt-6 inline-flex">Back to orders</Link>
    </div>
  );
}
