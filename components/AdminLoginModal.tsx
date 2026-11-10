'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Lock, X, Loader2, AlertCircle, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminLoginModal({ isOpen, onClose }: AdminLoginModalProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setErrorMessage('');
      setIsSuccess(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isLoading) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();

      if (res.ok && data?.data?.authenticated) {
        setIsSuccess(true);
        toast.success('✨ Login Administrator Berhasil!');
        setTimeout(() => {
          onClose();
          router.push('/admin');
        }, 600);
      } else {
        setErrorMessage(data?.message || 'Kata sandi administrator salah.');
      }
    } catch (err: any) {
      setErrorMessage('Terjadi kendala jaringan saat menghubungi server.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md bg-[#161618] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#1c1c1f]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Super Admin Control</h3>
                <p className="text-xs text-white/50">Masukkan kata sandi untuk masuk ke Dashboard</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-white/60 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {errorMessage && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs animate-in fade-in duration-150">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {isSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs animate-in fade-in duration-150">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Autentikasi berhasil! Mengalihkan ke Control Center...</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white/80 block">Kata Sandi Administrator</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ketik password master..."
                  autoFocus
                  required
                  disabled={isLoading || isSuccess}
                  className="w-full bg-[#101012] border border-white/15 focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/60 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 text-xs font-medium text-white/70 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isLoading || !password.trim() || isSuccess}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Memverifikasi...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Masuk Dashboard</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
