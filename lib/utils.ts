import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getHighResImage(url: string | undefined, size = 800): string {
  if (!url || typeof url !== 'string' || !url.trim()) return '';
  if (url.includes('googleusercontent.com') || url.includes('ytimg.com') || url.includes('ggpht.com')) {
    let result = url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`);
    result = result.replace(/=s\d+/, `=s${size}`);
    return result;
  }
  return url;
}
