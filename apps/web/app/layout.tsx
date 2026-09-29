import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  applicationName: 'APK STORE Admin',
  title: { default: 'APK STORE', template: '%s · APK STORE' },
  icons: {
    icon: [{ url: '/admin-icon-192.png', type: 'image/png', sizes: '192x192' }, { url: '/admin-icon-512.png', type: 'image/png', sizes: '512x512' }],
    apple: [{ url: '/admin-icon-192.png', sizes: '192x192', type: 'image/png' }]
  },
  appleWebApp: { capable: true, title: 'APK Admin' }
};
export const viewport: Viewport = { themeColor: '#090d0b' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
