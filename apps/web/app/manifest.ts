import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'APK STORE Admin', short_name: 'APK Admin', description: 'Manage APK STORE apps and releases',
    start_url: '/admin/apps/new', scope: '/admin/', display: 'standalone',
    background_color: '#090d0b', theme_color: '#090d0b',
    icons: [
      { src: '/admin-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/admin-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
