import Image from 'next/image';

/**
 * Logo de la marca. Los de public/brand pasan por el optimizador de Next; los cargados en el panel
 * (Supabase Storage o /api/dev-media) se sirven tal cual para no depender de su dominio ni de su tamaño.
 */
export function BrandLogo({ src, width, height, className, priority }: { src: string; width: number; height: number; className?: string; priority?: boolean }) {
  return <Image src={src} alt="Energy Solutions" width={width} height={height} priority={priority} unoptimized={!src.startsWith('/brand/')} className={className} />;
}
