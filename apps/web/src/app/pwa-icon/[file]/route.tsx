import { ImageResponse } from 'next/og';
import { BrandIconCanvas } from '@sharpit/app/lib/ui/brand-icon-canvas';
import { PWA_ICONS, pwaIconOf } from '@/app/pwa-icon/pwa-icons';

export function generateStaticParams() {
  return PWA_ICONS.map((icon) => ({ file: icon.file }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const icon = pwaIconOf((await params).file);
  if (!icon) {
    return new Response(null, { status: 404 });
  }
  return new ImageResponse(
    <BrandIconCanvas outerRadius={icon.maskable ? 0 : undefined} width={icon.size} />,
    { width: icon.size, height: icon.size },
  );
}
