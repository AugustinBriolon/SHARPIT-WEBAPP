import { Activity, CalendarDays, Footprints, HeartPulse, MessageCircle, Sun } from 'lucide-react';
import { LANDING_PHONE } from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { DATA, HEADING } from './landing-parts';

const TAB_ICONS = [Sun, CalendarDays, MessageCircle, Activity, HeartPulse];
const CONFIDENCE_TICKS = 24;
/** "Confiance moyenne": 0.68 of the scale, as the example morning below says. */
const CONFIDENCE_LIT = Math.round(CONFIDENCE_TICKS * 0.68);

type DayState = (typeof LANDING_PHONE.week)[number]['state'];

const DAY_MARK: Record<DayState, string> = {
  done: 'bg-foreground',
  today: 'bg-highlight ring-foreground ring-1',
  planned: 'border-foreground/40 border',
  key: 'bg-foreground/0 border-foreground border-2',
  rest: 'bg-foreground/10',
};

/**
 * The app's Résumé on an iPhone, built from the design system rather than a screenshot so it
 * follows the theme and never drifts from the copy. Example figures, said on the frame.
 */
export function Phone() {
  return (
    <figure
      aria-label={`${LANDING_PHONE.tag} : l’écran Résumé de l’app SharpIt`}
      className="relative mx-auto w-[300px] shrink-0 rounded-[3.1rem] border-[10px] border-[oklch(0.2_0.04_139)] bg-[oklch(0.2_0.04_139)] dark:ring-1 dark:ring-white/15"
      data-phone
    >
      <div className="bg-background relative flex h-[600px] flex-col overflow-hidden rounded-[2.5rem]">
        <div className="flex items-center justify-between px-7 pt-3.5 text-[0.6875rem] font-semibold">
          <span className={DATA}>{LANDING_PHONE.time}</span>
          <span className="h-[22px] w-[84px] rounded-full bg-[oklch(0.2_0.04_139)]" aria-hidden />
          <span className="text-muted-foreground text-[0.625rem] uppercase">
            {LANDING_PHONE.tag}
          </span>
        </div>

        <div className="landing-canvas flex-1 px-4 pt-5">
          <p className={cn(HEADING, 'text-[1.625rem] leading-none')} data-phone-item>
            {LANDING_PHONE.date}
          </p>
          <div className="mt-3 flex gap-1.5" data-phone-item>
            {LANDING_PHONE.chips.map((chip) => (
              <span
                key={chip}
                className="border-foreground/15 bg-background/70 rounded-full border px-2 py-0.5 text-[0.625rem]"
              >
                {chip}
              </span>
            ))}
          </div>

          <div className="analysis-panel-alt mt-4 p-3.5" data-phone-item>
            <p className="text-label text-muted-foreground !text-[0.5625rem]">
              {LANDING_PHONE.verdictLabel}
            </p>
            <p className={cn(HEADING, 'mt-1.5 text-xl leading-tight')}>{LANDING_PHONE.verdict}</p>
            <p className="text-muted-foreground mt-1 text-[0.6875rem] leading-snug">
              {LANDING_PHONE.reason}
            </p>
            <div className="mt-3 flex h-3 items-end gap-[3px]" aria-hidden>
              {Array.from({ length: CONFIDENCE_TICKS }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'w-[2px] origin-bottom rounded-full',
                    i < CONFIDENCE_LIT ? 'bg-foreground h-3' : 'bg-foreground/20 h-2',
                  )}
                  data-phone-tick
                />
              ))}
            </div>
            <p className="text-muted-foreground mt-1 text-[0.5625rem]">
              {LANDING_PHONE.confidence}
            </p>
          </div>

          <div
            className="analysis-panel mt-2.5 flex items-center gap-3 p-3"
            data-phone-item
            data-phone-session
          >
            <span className="bg-highlight text-highlight-foreground grid size-9 place-items-center rounded-xl">
              <Footprints className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground flex items-center justify-between text-[0.5625rem] uppercase">
                {LANDING_PHONE.sessionLabel}
                <span
                  className="bg-highlight/60 text-foreground rounded-full px-1.5 py-px normal-case"
                  data-phone-badge
                >
                  {LANDING_PHONE.proposal}
                </span>
              </span>
              <span className="mt-0.5 block text-sm font-medium">{LANDING_PHONE.session}</span>
              <span className={cn(DATA, 'text-muted-foreground block text-[0.625rem]')}>
                {LANDING_PHONE.sessionMeta}
              </span>
            </span>
          </div>

          <div className="mt-4" data-phone-item>
            <p className="text-muted-foreground text-[0.5625rem] uppercase">
              {LANDING_PHONE.weekLabel}
            </p>
            <ol className="mt-2 grid grid-cols-7 gap-1 text-center">
              {LANDING_PHONE.week.map((entry, i) => (
                <li key={i} className="flex flex-col items-center gap-1.5">
                  <span className={cn(DATA, 'text-muted-foreground text-[0.5625rem]')}>
                    {entry.day}
                  </span>
                  <span className={cn('block size-3 rounded-full', DAY_MARK[entry.state])} />
                  <span className="h-2 text-[0.5rem] font-medium">
                    {entry.state === 'key' ? LANDING_PHONE.keyLabel : ''}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <nav
          className="bg-background/85 border-foreground/10 mx-3 mb-3 grid grid-cols-5 rounded-full border px-1 py-1.5 backdrop-blur"
          aria-hidden
        >
          {LANDING_PHONE.tabs.map((tab, i) => {
            const Icon = TAB_ICONS[i];
            return (
              <span
                key={tab}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-full py-1 text-[0.5rem]',
                  i === 0 ? 'bg-highlight/50 font-semibold' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-3.5" />
                {tab}
              </span>
            );
          })}
        </nav>
      </div>
    </figure>
  );
}
