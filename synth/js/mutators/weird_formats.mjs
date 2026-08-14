const SPANISH_MONTHS = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
];

export const DATE_STYLES = ['dmy_slash','dmy_dash','short_year','long_spanish','iso','us_style'];
export const DECIMAL_STYLES = ['es_standard','en_style','apostrophe','no_thousands'];
export const CURRENCY_STYLES = ['euro_before','euro_after','eur_code','no_symbol'];

export function formatDate(dateStr, style) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y) return dateStr;
  const pad = n => String(n).padStart(2, '0');
  switch (style) {
    case 'dmy_slash':    return `${pad(d)}/${pad(m)}/${y}`;
    case 'dmy_dash':     return `${pad(d)}-${pad(m)}-${y}`;
    case 'short_year':   return `${pad(d)}/${pad(m)}/${String(y).slice(-2)}`;
    case 'long_spanish': return `${d} de ${SPANISH_MONTHS[m - 1]} de ${y}`;
    case 'us_style':     return `${pad(m)}/${pad(d)}/${y}`;
    default:             return dateStr;
  }
}

function addThousands(n, sep) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

export function formatMoney(amount, decimalStyle = 'es_standard', currencyStyle = 'euro_after') {
  if (amount == null) return '';
  const absAmt = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  const intPart = Math.trunc(absAmt);
  const decPart = Math.round((absAmt - intPart) * 100);
  const dec2 = String(decPart).padStart(2, '0');

  let formatted;
  switch (decimalStyle) {
    case 'es_standard': formatted = addThousands(intPart, '.') + `,${dec2}`; break;
    case 'en_style':    formatted = absAmt.toFixed(2); break;
    case 'apostrophe':  formatted = addThousands(intPart, "'") + `,${dec2}`; break;
    default:            formatted = `${intPart},${dec2}`; break;
  }
  formatted = sign + formatted;

  switch (currencyStyle) {
    case 'euro_before': return `€ ${formatted}`;
    case 'euro_after':  return `${formatted} €`;
    case 'eur_code':    return `${formatted} EUR`;
    default:            return formatted;
  }
}
