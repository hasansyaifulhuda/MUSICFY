'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

/**
 * Dynamically Chunked Client Player Component
 *
 * Loaded on demand exclusively on the client side ({ ssr: false }),
 * preventing the 42KB audio engine & player state bundle from blocking initial SSR.
 * Automatically hidden inside /admin routes to give full screen to Admin Dashboard.
 */
const DynamicPlayer = dynamic(
  () => import('@/components/Player'),
  {
    ssr: false,
    loading: () => null,
  }
);

export function ClientPlayer() {
  const pathname = usePathname();

  if (pathname?.startsWith('/admin')) {
    return null;
  }

  return <DynamicPlayer />;
}

export default ClientPlayer;
