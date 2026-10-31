export const STORAGE_KEY = 'hon-no-tayori:v1';
export const emptyDraft = () => ({ title: '', author: '', publisher: '', isbn: '', price: '' });
export const initialState = () => ({ version: 1, books: [], customer: { name: '', phone: '' }, draft: emptyDraft(), editingId: null, formOpen: false, lookupIsbn: '', activeTab: 'order' });
export function normalizeIsbn(value) {
  return String(value ?? '').normalize('NFKC').replace(/[\s\-‐‑‒–—―ー]/g, '').toUpperCase();
}
export function isValidIsbn(value) {
  const isbn = normalizeIsbn(value);
  if (/^\d{9}[\dX]$/.test(isbn)) return [...isbn].reduce((sum, c, i) => sum + (c === 'X' ? 10 : Number(c)) * (10 - i), 0) % 11 === 0;
  if (/^97[89]\d{10}$/.test(isbn)) return [...isbn].reduce((sum, c, i) => sum + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0;
  return false;
}
export function toIsbn13(value) {
  const isbn = normalizeIsbn(value);
  if (isbn.length !== 10) return isbn;
  const prefix = '978' + isbn.slice(0, 9);
  const sum = [...prefix].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0);
  return prefix + ((10 - sum % 10) % 10);
}
export function parsePrice(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > 99999999) throw new Error('価格は0〜99,999,999円の整数で入力してください。');
  return n;
}
export function validateDraft(draft) {
  if (!draft.title.trim()) throw new Error('タイトルを入力してください。');
  const isbn = normalizeIsbn(draft.isbn);
  if (isbn && !isValidIsbn(isbn)) throw new Error('ISBNが正しくありません。10桁または13桁の番号を確認してください。');
  return { title: draft.title.trim(), author: draft.author.trim(), publisher: draft.publisher.trim(), isbn, price: parsePrice(draft.price) };
}
export const money = value => '¥' + new Intl.NumberFormat('ja-JP').format(value);
export function orderTotals(books) {
  const orders = books.filter(b => b.list === 'order');
  return { count: orders.length, total: orders.reduce((sum, b) => sum + (b.price ?? 0), 0), unknown: orders.filter(b => b.price === null).length };
}
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const array = value => value == null ? [] : Array.isArray(value) ? value : [value];
export function bookFromOpenBd(record, isbn) {
  if (!record) return null;
  const summary = record.summary ?? {};
  const onix = record.onix ?? {};
  const prices = array(onix.ProductSupply).flatMap(s => [
    ...array(s.SupplyDetail).flatMap(d => array(d.Price)), ...array(s.Price)
  ]).filter(p => !p.CurrencyCode || p.CurrencyCode === 'JPY');
  // ONIX 02 is a retail price including tax. Other types stay blank to avoid an incorrect total.
  const retail = prices.find(p => String(p.PriceType) === '02' && p.PriceAmount != null);
  let price = null;
  if (retail) { try { price = parsePrice(retail.PriceAmount); } catch { /* Keep unavailable prices blank. */ } }
  const title = summary.title || onix.DescriptiveDetail?.TitleDetail?.TitleElement?.TitleText || '';
  if (!title) return null;
  return { title: String(title), author: String(summary.author || array(onix.DescriptiveDetail?.Contributor).map(c => c.PersonName).filter(Boolean).join(' / ')), publisher: String(summary.publisher || onix.PublishingDetail?.Imprint?.ImprintName || ''), isbn, price: price === null ? '' : String(price) };
}
export function restoreState(raw) {
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !Array.isArray(data.books)) throw new Error('保存データの形式が異なります。');
  const state = initialState();
  const ids = new Set();
  state.books = data.books.map(b => {
    if (!b || typeof b.id !== 'string' || ids.has(b.id) || !['order', 'later'].includes(b.list) || typeof b.title !== 'string' || !b.title.trim()) throw new Error('保存された書籍の形式が異なります。');
    ids.add(b.id);
    const text = key => typeof b[key] === 'string' ? b[key] : '';
    return { id: b.id, list: b.list, title: b.title, author: text('author'), publisher: text('publisher'), isbn: text('isbn'), price: parsePrice(b.price) };
  });
  for (const key of ['name', 'phone']) if (typeof data.customer?.[key] === 'string') state.customer[key] = data.customer[key];
  for (const key of Object.keys(state.draft)) if (typeof data.draft?.[key] === 'string') state.draft[key] = data.draft[key];
  state.editingId = ids.has(data.editingId) ? data.editingId : null;
  state.formOpen = Boolean(data.formOpen);
  state.lookupIsbn = typeof data.lookupIsbn === 'string' ? data.lookupIsbn : '';
  state.activeTab = data.activeTab === 'later' ? 'later' : 'order';
  return state;
}
