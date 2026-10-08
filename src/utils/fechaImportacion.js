const fechaValida = (year, month, day) => {
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day);
};

/** Convierte fechas Excel/CSV sin depender del idioma regional del navegador. */
export function fechaImportacionISO(valor) {
  if (valor instanceof Date) return Number.isFinite(valor.getTime()) ? valor.toISOString() : null;
  if (typeof valor === 'number' && Number.isFinite(valor) && valor > 0) return null; // Los seriales Excel se convierten con XLSX.SSF en el lector.
  const texto = String(valor ?? '').trim();
  if (!texto) return null;

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/i);
  if (iso) {
    const [, year, month, day, hour = '00', minute = '00', second = '00', zone] = iso;
    if (!fechaValida(year, month, day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
    if (zone) {
      const parsed = new Date(texto);
      return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
    }
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }

  const latino = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!latino) return null;
  const [, day, month, year, hour = '0', minute = '0', second = '0'] = latino;
  if (!fechaValida(year, month, day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).toISOString();
}
