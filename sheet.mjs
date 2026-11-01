import { orderTotals, money, escapeHtml as esc, formatIsbn } from './core.mjs';

export function orderSheetMarkup(order) {
  const books = order.books.filter(b => b.list === 'order');
  const totals = orderTotals(books);
  const date = order.confirmedAt ? new Date(order.confirmedAt) : new Date();
  const stamp = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
  return `<article class="order-sheet">
    <header class="sheet-heading"><h1>書籍取り寄せ依頼票</h1><div class="sheet-date"><span>ご依頼日</span><time>${esc(stamp)}</time></div></header>
    <p class="sheet-message">下記の書籍のお取り寄せをお願いいたします。</p>
    <div class="sheet-customer"><div><span class="sheet-label">お名前</span><p><strong>${esc(order.customer.name)}</strong><span class="sheet-honorific">様</span></p></div><div><span class="sheet-label">お電話番号</span><p><strong>${esc(order.customer.phone)}</strong></p></div></div>
    <table class="sheet-table"><thead><tr><th scope="col">番号</th><th scope="col">ご依頼の書籍</th><th scope="col">価格（税込）</th></tr></thead><tbody>${books.map((b, i) => `<tr><td class="sheet-number">${String(i + 1).padStart(2, '0')}</td><td>
      <strong class="sheet-book-title">${esc(b.title)}</strong>
      <dl class="sheet-meta"><div><dt>著者</dt><dd>${esc(b.author || '未記入')}</dd></div><div><dt>出版社</dt><dd>${esc(b.publisher || '未記入')}</dd></div></dl>
      <p class="sheet-isbn"><span>ISBN</span>${esc(formatIsbn(b.isbn) || '未記入')}</p>
    </td><td class="sheet-price">${b.price === null ? '未記入' : money(b.price)}</td></tr>`).join('')}</tbody></table>
    <div class="sheet-summary"><p class="sheet-quantity">ご依頼冊数 <strong>${totals.count}<span>冊</span></strong></p><div class="sheet-total"><span>参考合計（税込）</span><strong>${money(totals.total)}</strong></div></div>
    ${totals.unknown ? `<p class="sheet-notes">※ 価格未記入の${totals.unknown}冊は参考合計に含んでいません。</p>` : ''}
    <div class="sheet-store"><span>書店様ご記入欄</span><div class="sheet-writing-line"></div><div class="sheet-writing-line"></div></div>
  </article>`;
}
