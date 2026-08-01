import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sull AI Console',
  description: 'Enterprise control plane for Sull AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
