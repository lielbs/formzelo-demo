/** Phone helpers mirroring private.tables_normalize_phone. Display input is never rewritten. */
export function normalizePhone(input: string): string | null {
  if (!input || !input.trim()) return null;
  let d = input.replace(/[^0-9+]/g, '');
  if (d.startsWith('+')) d = '+' + d.slice(1).replace(/\+/g, '');
  else if (d.startsWith('00')) d = '+' + d.slice(2);
  else if (d.startsWith('972')) d = '+' + d;
  else if (/^0[2-9]\d{7,8}$/.test(d)) d = '+972' + d.slice(1);
  else return null;
  return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
}

/** Local Israeli display for +972 numbers, otherwise the E.164 form. */
export function displayPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  if (e164.startsWith('+972')) {
    const local = '0' + e164.slice(4);
    if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3)}`;
    if (local.length === 9) return `${local.slice(0, 2)}-${local.slice(2)}`;
    return local;
  }
  return e164;
}

export const telHref = (e164: string) => `tel:${e164}`;
/** Standard click-to-chat link; the person sends the message themselves. */
export const whatsappHref = (e164: string, text?: string) =>
  `https://wa.me/${e164.replace(/^\+/, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
