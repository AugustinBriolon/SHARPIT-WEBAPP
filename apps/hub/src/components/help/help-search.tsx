'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, Search } from 'lucide-react';
import { cn } from '@sharpit/app/lib/utils';
import { searchHelp, type HelpSearchResult, type PreparedEntry } from '@/help/search';

const CONTACT_HREF = '/aide/contact/donner-un-avis';

/** Downloads the articles once, the first time a reader reaches for the search. */
let indexPromise: Promise<readonly PreparedEntry[]> | undefined;
function loadIndex(): Promise<readonly PreparedEntry[]> {
  indexPromise ??= import('@/help/search-index').then((module) => module.HELP_SEARCH_INDEX);
  return indexPromise;
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function optionId(listId: string, i: number): string {
  return `${listId}-${i}`;
}

/** The answers under the field, or a way out when there is none. */
function SearchPanel({
  results,
  query,
  active,
  listId,
  wide,
  onHover,
  onClose,
}: {
  results: readonly HelpSearchResult[];
  query: string;
  active: number;
  listId: string;
  /** In the header the panel is wider than the field it hangs from. */
  wide: boolean;
  onHover: (i: number) => void;
  onClose: () => void;
}) {
  return (
    <div
      className={cn(
        'bg-popover text-popover-foreground absolute inset-x-0 z-30 mt-2 overflow-hidden rounded-3xl shadow-xl ring-1 ring-black/5 dark:ring-white/10',
        wide && 'sm:right-0 sm:left-auto sm:w-[28rem]',
      )}
      // Keeps the field focused while a result is pressed, so the click lands.
      onMouseDown={(event) => event.preventDefault()}
    >
      {results.length ? (
        <ul
          aria-label="Articles trouvés"
          className="max-h-[60vh] overflow-y-auto p-2"
          id={listId}
          role="listbox"
        >
          {results.map((result, i) => (
            <li
              key={result.href}
              aria-selected={i === active}
              id={optionId(listId, i)}
              role="option"
            >
              <Link
                href={result.href}
                className={cn(
                  'flex items-start gap-3 rounded-2xl px-4 py-3 transition-colors',
                  i === active ? 'bg-muted' : 'hover:bg-muted/60',
                )}
                onClick={onClose}
                onMouseEnter={() => onHover(i)}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-label text-muted-foreground block">{result.category}</span>
                  <span className="mt-1 block font-medium">{result.title}</span>
                  <span className="text-muted-foreground mt-1 line-clamp-2 block text-sm">
                    {result.snippet.before}
                    {result.snippet.match ? (
                      <mark className="bg-highlight/60 text-foreground rounded-sm">
                        {result.snippet.match}
                      </mark>
                    ) : null}
                    {result.snippet.after}
                  </span>
                </span>
                {i === active ? (
                  <CornerDownLeft
                    className="text-muted-foreground mt-1 size-4 shrink-0"
                    aria-hidden
                  />
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground px-6 py-5 text-sm" id={listId} role="status">
          Aucun article ne parle de « {query.trim()} ». Essaie un autre mot, ou{' '}
          <Link className="text-foreground underline underline-offset-2" href={CONTACT_HREF}>
            écris-nous
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/**
 * The help centre's search: a combobox over every article, answered as the reader types.
 * `/` focuses it from anywhere on the page; arrows move through the answers, Enter opens one.
 */
export function HelpSearch({ size = 'compact' }: { size?: 'hero' | 'compact' }) {
  const router = useRouter();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState<readonly PreparedEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => (index ? searchHelp(index, query) : []), [index, query]);
  const showsPanel = open && query.trim().length > 1 && index !== null;

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !isTyping(event.target)) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const prepare = () => {
    setOpen(true);
    if (!index) {
      loadIndex().then(setIndex);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (query) {
        setQuery('');
      } else {
        input.current?.blur();
      }
      return;
    }
    if (!showsPanel || results.length === 0) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      setOpen(false);
      router.push(results[active].href);
    }
  };

  const hero = size === 'hero';

  return (
    <div className={cn('relative w-full', hero ? 'max-w-2xl' : 'max-w-xs')}>
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Rechercher dans l’aide
      </label>
      <div
        className={cn(
          'bg-card text-foreground flex items-center gap-3 rounded-full shadow-sm ring-1 ring-black/5 transition-shadow focus-within:shadow-md dark:ring-white/10',
          hero ? 'h-16 px-6' : 'h-10 px-4',
        )}
      >
        <Search
          className={cn('text-muted-foreground shrink-0', hero ? 'size-5' : 'size-4')}
          aria-hidden
        />
        <input
          ref={input}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={showsPanel}
          autoComplete="off"
          id={`${listId}-input`}
          placeholder={hero ? 'Garmin, récupération, abonnement…' : 'Rechercher'}
          role="combobox"
          spellCheck={false}
          type="search"
          value={query}
          aria-activedescendant={
            showsPanel && results.length ? optionId(listId, active) : undefined
          }
          className={cn(
            // Escape clears the field: the browser's own clear button would duplicate it.
            'placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent outline-none [&::-webkit-search-cancel-button]:appearance-none',
            hero ? 'text-lg' : 'text-sm',
          )}
          onBlur={() => setOpen(false)}
          onFocus={prepare}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            prepare();
          }}
        />
        <kbd
          className="text-muted-foreground border-foreground/15 hidden rounded border px-1.5 font-[family-name:var(--font-data)] text-xs sm:inline"
          aria-hidden
        >
          /
        </kbd>
      </div>
      {showsPanel ? (
        <SearchPanel
          active={active}
          listId={listId}
          query={query}
          results={results}
          wide={!hero}
          onClose={() => setOpen(false)}
          onHover={setActive}
        />
      ) : null}
    </div>
  );
}
