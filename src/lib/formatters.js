export const fmt = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 });
export const intFmt = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 0 });
const finite = (v) => Number.isFinite(Number(v));
export const mw = (v) => (finite(v) ? `${fmt.format(Number(v))} MW` : 'Valor exacto no detallado en la fuente');
export const gwh = (v) => (finite(v) ? `${fmt.format(Number(v))} GWh` : 'Valor exacto no detallado en la fuente');
export const musd = (v) => (finite(v) ? `${fmt.format(Number(v))} MUSD` : 'Valor exacto no detallado en la fuente');
export const pct = (v) => (finite(v) ? `${fmt.format(Number(v))}%` : 'Valor exacto no detallado en la fuente');
