import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CarnetEmptyDay } from './carnet-empty-day';

const props = {
  aside: null,
  kicker: "Aujourd'hui",
  title: 'Rien encore',
  description: 'Relie une source.',
};

describe('CarnetEmptyDay', () => {
  it('puts the race band first on an otherwise empty race day', () => {
    const html = renderToStaticMarkup(
      createElement(CarnetEmptyDay, {
        ...props,
        race: {
          goalId: 'g',
          title: 'Triathlon de Lorient',
          raceFormat: 'Triathlon M',
          targetPerformance: null,
          targetDate: '2026-10-12',
          phase: 'raceDay',
          activity: null,
        },
      }),
    );
    expect(html).toContain('Jour J');
    expect(html.indexOf('Triathlon de Lorient')).toBeLessThan(html.indexOf('Relier une source'));
  });

  it('reads as the plain empty state without a race', () => {
    const html = renderToStaticMarkup(createElement(CarnetEmptyDay, { ...props, race: null }));
    expect(html).not.toContain('Jour J');
    expect(html).toContain('Relier une source');
  });
});
