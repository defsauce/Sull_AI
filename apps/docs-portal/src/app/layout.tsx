import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sull AI Docs',
  description: 'Platform documentation for Sull AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'Sora, Avenir Next, Segoe UI, sans-serif',
          background: '#f7faf9',
          color: '#0b1f1c',
        }}
      >
        {children}
      </body>
    </html>
  );
}
