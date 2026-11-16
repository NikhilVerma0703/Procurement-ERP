// The Purchase screens' class joiner (as lib/pigment/cn.ts in the Main ERP).
// Conflicting Tailwind utilities resolve to the last one. Pure.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
