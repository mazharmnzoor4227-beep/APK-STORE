import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { applicationName: 'APK STORE Admin', appleWebApp: { capable: true, title: 'APK Admin' } };
export const viewport: Viewport = { themeColor: '#090d0b' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
