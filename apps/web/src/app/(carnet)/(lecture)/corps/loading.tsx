// Mirrors the cards of the page so nothing jumps when the reading arrives (ADR-072, ADR-108).
const PULSE = 'bg-muted animate-pulse rounded motion-reduce:animate-none';

export default function Loading() {
  return (
    <div className="space-y-12 pb-24" role="status" aria-busy>
      <span className="sr-only">Chargement</span>
      <div className="space-y-2">
        <p className="text-label text-muted-foreground h-4">Le corps</p>
        <div className={`${PULSE} h-9 w-2/3 sm:h-10`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1, 2, 3].map((card) => (
          <div key={card} className="card-surface space-y-6">
            <div className="space-y-2">
              <div className={`${PULSE} h-3 w-24`} />
              <div className={`${PULSE} h-5 w-40`} />
            </div>
            <div className={`${PULSE} h-28 w-full`} />
            <div className={`${PULSE} h-40 w-full`} />
          </div>
        ))}
      </div>
    </div>
  );
}
