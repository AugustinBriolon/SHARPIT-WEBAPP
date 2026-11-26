import { ArrowUpRight, Sparkles } from 'lucide-react';
import { buttonVariants } from '@sharpit/ui/components/ui/button';
import { LANDING_HERO, LANDING_LINKS } from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';

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
      aria-label="En résumé"
      className={cn(
        'border-border/80 bg-muted/20 relative my-8 overflow-hidden rounded-2xl border p-6 sm:p-8',
        className,
      )}
    >
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
        <Sparkles className="text-highlight size-4" aria-hidden />
        <span>En résumé</span>
      </div>

      <p className="text-foreground mt-4 text-base leading-relaxed font-normal sm:text-lg">
        {directAnswer}
      </p>

      {sharpitPunchline ? (
        <div className="border-border/60 bg-background/60 mt-6 rounded-xl border p-4">
          <p className="text-foreground text-sm font-medium">
            <span className="text-highlight font-medium">La réponse SharpIt : </span>
            {sharpitPunchline}
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <a
          href={LANDING_LINKS.demo}
          className={buttonVariants({
            size: 'default',
            className: 'px-5 font-medium shadow-sm',
          })}
        >
          <span>Tester la démo</span>
          <ArrowUpRight className="ml-1.5 size-4" aria-hidden />
        </a>
        <a
          href={LANDING_LINKS.download}
          rel="noreferrer"
          target="_blank"
          className={buttonVariants({
            size: 'default',
            variant: 'outline',
            className: 'px-5',
          })}
        >
          <span>{LANDING_HERO.download.label}</span>
          <ArrowUpRight className="ml-1.5 size-4" aria-hidden />
        </a>
      </div>
    </section>
  );
}
