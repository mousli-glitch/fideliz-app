import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sanitizeSlug(text: string): string {
  const reserved = ['admin', 'login', 'api', 'play', 'dashboard', 'settings']
  let slug = text.toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-')
  if (reserved.includes(slug)) slug += '-restaurant'
  return slug
}