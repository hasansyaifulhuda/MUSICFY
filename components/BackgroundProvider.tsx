'use client';

import { memo, useEffect } from 'react';
import { usePlayerStore } from '@/lib/store';
import { FastAverageColor } from 'fast-average-color';
import { getHighResImage } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export const BackgroundProvider = memo(function BackgroundProvider() {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const setDominantColor = usePlayerStore((state) => state.setDominantColor);
  const dominantColor = usePlayerStore((state) => state.dominantColor);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.classList.remove('oled-theme');
      root.removeAttribute('data-oled');
    }
  }, []);

  useEffect(() => {
    if (!currentTrack?.thumbnails?.length) {
      setDominantColor(null);
      return;
    }

    const fac = new FastAverageColor();
    const imageUrl = getHighResImage(currentTrack.thumbnails[currentTrack.thumbnails.length - 1].url, 400);

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;

    img.onload = () => {
      try {
        const color = fac.getColor(img);
        setDominantColor(color.hex);
      } catch {
        setDominantColor(null);
      }
    };

    img.onerror = () => {
      setDominantColor(null);
    };

    return () => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
      fac.destroy();
    };
  }, [currentTrack?.videoId, currentTrack?.thumbnails, setDominantColor]);

  return (
    <div className="fixed inset-0 -z-50 bg-[#060606] overflow-hidden pointer-events-none select-none gpu-accelerated contain-strict">
      <AnimatePresence mode="wait">
        {dominantColor ? (
          <motion.div
            key={dominantColor}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 gpu-accelerated"
            style={{
              background: `
                radial-gradient(circle at 20% 0%, color-mix(in srgb, ${dominantColor} 45%, transparent) 0%, transparent 65%),
                radial-gradient(circle at 80% 15%, color-mix(in srgb, ${dominantColor} 30%, transparent) 0%, transparent 55%),
                radial-gradient(circle at 50% 50%, color-mix(in srgb, ${dominantColor} 15%, transparent) 0%, #060606 80%),
                #060606
              `,
              willChange: 'opacity, transform',
              transform: 'translate3d(0, 0, 0)',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          />
        ) : (
          <motion.div
            key="default-ambient"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 gpu-accelerated"
            style={{
              background: `
                radial-gradient(circle at 50% 0%, rgba(29, 185, 84, 0.12) 0%, transparent 60%),
                radial-gradient(circle at 80% 30%, rgba(255, 255, 255, 0.02) 0%, transparent 50%),
                #060606
              `,
              willChange: 'opacity, transform',
              transform: 'translate3d(0, 0, 0)',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          />
        )}
      </AnimatePresence>

      {/* Subtle Glass Noise Overlay for authentic Apple Music frosted texture */}
      <div
        className="absolute inset-0 opacity-[0.025] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.8) 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }}
      />
    </div>
  );
});
