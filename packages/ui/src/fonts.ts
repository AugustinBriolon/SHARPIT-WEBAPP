import { Inter } from 'next/font/google';

/** The brand family (ADR-085), as a CSS variable every app puts on `<html>`. */
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export const FONT_VARIABLES = [inter.variable];
