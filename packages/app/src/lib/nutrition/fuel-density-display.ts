import { formatWeightKgDisplay } from '@sharpit/app/lib/health/body-composition';

export function formatMacroGPerKg(value: number): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatFuelDensityReference(weightKg: number): string {
  const display = formatWeightKgDisplay(weightKg).replace('.', ',');
  return `Réf. ${display} kg · dernière pesée`;
}
