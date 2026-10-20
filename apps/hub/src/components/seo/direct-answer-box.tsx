import { ArrowUpRight, Sparkles } from 'lucide-react';
import { buttonVariants } from '@sharpit/ui/components/ui/button';
import { cn } from '@sharpit/app/lib/utils';

const DEMO_URL = 'https://web.sharpit.app/demo';
const APP_STORE_URL = 'https://apps.apple.com/app/sharpit/id6737190000'; // Fallback / canonical App Store

export function DirectAnswerBox({
  directAnswer,
  sharpitPunchline,
  className,
}: {
  directAnswer: string;
  sharpitPunchline?: string;
  className?: string;
}) {
  return (
    <section
      aria-label="Réponse directe"
      className={cn(
        'border-border/80 bg-muted/20 relative my-8 overflow-hidden rounded-2xl border p-6 sm:p-8',
        className,
      )}
    >
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
        <Sparkles className="text-highlight size-4" aria-hidden />
        <span>En résumé (Réponse directe)</span>
      </div>

      <p className="text-foreground mt-4 text-base leading-relaxed font-normal sm:text-lg">
        {directAnswer}
      </p>

      {sharpitPunchline ? (
        <div className="border-border/60 bg-background/60 mt-6 rounded-xl border p-4">
          <p className="text-foreground text-sm font-medium">
            <span className="text-highlight font-semibold">La réponse SharpIt : </span>
            {sharpitPunchline}
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <a
          href={DEMO_URL}
          className={buttonVariants({
            size: 'default',
            className: 'px-5 font-medium shadow-sm',
          })}
        >
          <span>Tester la démo</span>
          <ArrowUpRight className="ml-1.5 size-4" aria-hidden />
        </a>
        <a
          href={APP_STORE_URL}
          rel="noreferrer"
          target="_blank"
          className={buttonVariants({
            size: 'default',
            variant: 'outline',
            className: 'px-5',
          })}
        >
          <span>App Store iOS</span>
          <ArrowUpRight className="ml-1.5 size-4" aria-hidden />
        </a>
      </div>
    </section>
  );
}
