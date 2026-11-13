import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isValidAdminToken } from '@/lib/adminAuth';

export const metadata = {
  title: 'MusicFY - Super Admin Control Center & VPS Monitoring',
  description: 'Enterprise Administrator Control Panel & VPS System Monitor for MusicFY',
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('musicfy_admin_token')?.value;

  if (!isValidAdminToken(token)) {
    redirect('/settings?auth_required=admin');
  }

  return (
    <div className="fixed inset-0 z-40 bg-[#09090b] text-white flex flex-col overflow-hidden font-sans selection:bg-emerald-500 selection:text-black">
      {children}
    </div>
  );
}
