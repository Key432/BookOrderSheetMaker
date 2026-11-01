import { STORAGE_KEY, emptyDraft, initialState, normalizeIsbn, isValidIsbn, toIsbn13, formatIsbn, validateDraft, orderTotals, money, escapeHtml as esc, bookFromOpenBd, restoreState, confirmOrder } from './core.mjs';
import { orderSheetMarkup } from './sheet.mjs';

const $ = id => document.getElementById(id);
let state = initialState();
let storageBlocked = false;
let toastTimer, lookupTimer, controller;
let requestSequence = 0;
let undoAction = null;
let previewOrder = null;
let deletedHistory = null;
try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) state = restoreState(saved); }
catch { storageBlocked = true; }

function save(nextState = state) {
  if (storageBlocked) return false;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState)); return true; }
  catch { storageBlocked = true; updateSaveStatus(); notify('保存できませんでした。サイトデータや空き容量を確認してください。'); return false; }
}
function updateSaveStatus() {
  if (!storageBlocked) return;
  $('save-status').classList.add('failed');
  $('save-status').innerHTML = '<span></span>自動保存できません';
  $('save-status').title = 'ブラウザーの保存領域を利用できないか、保存データを読み込めませんでした。既存データは上書きしていません。';
  document.querySelector('.list-footnote span').textContent = '保存領域を利用できないため、今回の変更は保存されません。';
  $('confirm-button').disabled = true;
}
function notify(message, undo = null) {
  clearTimeout(toastTimer);
  undoAction = undo;
  $('toast-text').textContent = message;
  $('undo-button').hidden = !undo;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; undoAction = null; }, undo ? 12000 : 6000);
}
$('toast-close').addEventListener('click', () => { $('toast').hidden = true; clearTimeout(toastTimer); undoAction = null; });
$('undo-button').addEventListener('click', () => {
  if (undoAction) { undoAction(); undoAction = null; save(); render(); }
  $('toast').hidden = true; clearTimeout(toastTimer);
});

const emptyArt = `<div class="empty-illustration" aria-hidden="true"><svg viewBox="0 0 100 92"><path d="m30 20 37-5 8 56-37 5Z" fill="#f8faf4"/><path d="m35 19 8 56M45 30l17-2M47 36l12-2M49 51l13-2M28 39l-8 3 15 38 34-13M23 43l12 32M74 23l6-5m-1 17 8-1M17 26l4 4"/><path d="M52 56c4-6 9-2 6 1l-5 5-6-3c-4-2-1-7 5-3Z" fill="#e8efdd"/></svg></div>`;
function render() {
  const totals = orderTotals(state.books);
  const laterCount = state.books.filter(b => b.list === 'later').length;
  $('order-count').textContent = totals.count;
  $('later-count').textContent = laterCount;
  $('summary-count').textContent = `${totals.count}冊`;
  $('total').textContent = money(totals.total);
  $('price-note').textContent = totals.unknown ? `価格未入力 ${totals.unknown}冊を除く参考合計です。` : totals.count ? '価格は目安です。実際の価格は書店でご確認ください。' : '書籍を追加すると合計が表示されます。';
  $('preview-button').disabled = !totals.count;
  $('confirm-button').disabled = !totals.count || storageBlocked;
  $('history-count').textContent = state.history.length;
  $('clear-order-button').disabled = !totals.count;
  $('clear-order-button').hidden = state.activeTab !== 'order';
  const items = state.books.filter(b => b.list === state.activeTab);
  $('list-count').textContent = `${items.length}冊`;
  for (const list of ['order', 'later']) {
    const selected = list === state.activeTab;
    $(`${list}-tab`).setAttribute('aria-selected', String(selected));
    $(`${list}-tab`).tabIndex = selected ? 0 : -1;
  }
  $('book-list').setAttribute('aria-labelledby', `${state.activeTab}-tab`);
  if (!items.length) {
    const later = state.activeTab === 'later';
    $('book-list').innerHTML = `<div class="empty-state">${emptyArt}<h3>${later ? '気になる本を、ここに。' : '次の一冊を、ここから。'}</h3><p>${later ? '注文リストの本を「後で買う」に移動すると、<br>この場所に保存されます。' : 'まだ注文リストに本がありません。<br>ISBNを入力するか、手入力で読みたい本を追加しましょう。'}</p><button class="text-button" data-action="${later ? 'show-order' : 'focus-isbn'}">${later ? '注文リストを見る' : '＋ 最初の一冊を追加する'}</button></div>`;
  } else {
    $('book-list').innerHTML = items.map((b, i) => `<article class="book-card" data-id="${esc(b.id)}"><div class="book-spine" aria-hidden="true">${String(i + 1).padStart(2, '0')}</div><div class="book-main"><div class="book-top"><h3>${esc(b.title)}</h3><span class="book-price ${b.price === null ? 'unknown' : ''}">${b.price === null ? '価格未入力' : money(b.price)}</span></div><p class="book-meta"><span>${esc(b.author || '著者未入力')}</span><span>${esc(b.publisher || '出版社未入力')}</span></p><p class="book-isbn">ISBN ${esc(formatIsbn(b.isbn) || '未入力')}</p><div class="book-bottom"><button class="move-button" data-action="move"><svg aria-hidden="true" viewBox="0 0 24 24">${b.list === 'order' ? '<path d="M6 3h12v18l-6-4-6 4Z"/>' : '<path d="M4 12h15m-6-6 6 6-6 6"/>'}</svg>${b.list === 'order' ? '後で買うに移動' : '注文リストに移動'}</button><div class="book-controls"><button data-action="edit" aria-label="${esc(b.title)}を編集">編集</button><button data-action="delete" aria-label="${esc(b.title)}を削除">削除</button></div></div></div></article>`).join('');
  }
  renderHistory();
}
function switchTab(tab, focus = false) { state.activeTab = tab; save(); render(); if (focus) $(`${tab}-tab`).focus(); }
$('clear-order-button').addEventListener('click', () => {
  const removed = state.books.map((book, index) => ({ book, index })).filter(({ book }) => book.list === 'order');
  if (!removed.length) return;
  state.books = state.books.filter(book => book.list !== 'order');
  if (removed.some(({ book }) => book.id === state.editingId)) resetForm();
  save(); render();
  notify(`注文リストの${removed.length}冊を削除しました。`, () => {
    for (const { book, index } of removed) {
      if (!state.books.some(current => current.id === book.id)) state.books.splice(Math.min(index, state.books.length), 0, book);
    }
  });
  $('order-tab').focus({ preventScroll: true });
});
for (const name of ['order', 'later']) {
  $(`${name}-tab`).addEventListener('click', () => switchTab(name));
  $(`${name}-tab`).addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); switchTab(e.key === 'Home' ? 'order' : e.key === 'End' ? 'later' : name === 'order' ? 'later' : 'order', true); }
  });
}
$('book-list').addEventListener('click', e => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'focus-isbn') { $('isbn').focus(); $('add-heading').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (action === 'show-order') { switchTab('order', true); return; }
  const id = button.closest('[data-id]')?.dataset.id;
  const book = state.books.find(b => b.id === id);
  if (!book) return;
  if (action === 'move') {
    const previous = book.list;
    book.list = previous === 'order' ? 'later' : 'order';
    const title = book.list === 'later' ? '「後で買う」に移動しました。' : '注文リストに移動しました。';
    notify(title, () => { const current = state.books.find(b => b.id === id); if (current) current.list = previous; });
  } else if (action === 'delete') {
    const index = state.books.indexOf(book);
    state.books.splice(index, 1);
    if (state.editingId === id) resetForm();
    notify('本をリストから削除しました。', () => { if (!state.books.some(b => b.id === id)) state.books.splice(Math.min(index, state.books.length), 0, book); });
  } else if (action === 'edit') {
    cancelLookup();
    state.editingId = id;
    state.draft = { title: book.title, author: book.author, publisher: book.publisher, isbn: book.isbn, price: book.price === null ? '' : String(book.price) };
    state.formOpen = true;
    syncForm();
    $('book-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('book-title').focus({ preventScroll: true });
  }
  save(); render();
  if (action !== 'edit') $(`${state.activeTab}-tab`).focus({ preventScroll: true });
});

function syncForm() {
  $('book-form').hidden = !state.formOpen;
  $('manual-button').setAttribute('aria-expanded', String(state.formOpen));
  for (const key of Object.keys(emptyDraft())) $(`book-${key}`).value = key === 'isbn' ? formatIsbn(state.draft[key]) : state.draft[key];
  $('form-title').textContent = state.editingId ? '書籍情報を編集' : '書籍情報を入力';
  $('add-submit').textContent = state.editingId ? '変更を保存' : '＋ 注文リストに追加';
  $('source-note').textContent = '価格がわからない場合は、空欄のまま追加できます。';
}
function resetForm() {
  cancelLookup();
  state.editingId = null; state.draft = emptyDraft(); state.formOpen = false; state.lookupIsbn = '';
  $('isbn').value = ''; $('book-error').textContent = ''; lookupMessage(''); syncForm();
}
$('manual-button').addEventListener('click', () => {
  cancelLookup();
  state.formOpen = !state.formOpen;
  syncForm(); save();
  if (state.formOpen) $('book-title').focus();
});
$('cancel-edit').addEventListener('click', () => { resetForm(); save(); $('manual-button').focus(); });
for (const key of Object.keys(emptyDraft())) $(`book-${key}`).addEventListener('input', e => { state.draft[key] = e.target.value; $('book-error').textContent = ''; save(); });
$('book-form').addEventListener('submit', e => {
  e.preventDefault();
  let book;
  try { book = validateDraft(state.draft); }
  catch (error) { $('book-error').textContent = error.message; return; }
  const duplicate = book.isbn && state.books.find(b => b.id !== state.editingId && b.isbn && toIsbn13(b.isbn) === toIsbn13(book.isbn));
  if (duplicate) { $('book-error').textContent = `このISBNは${duplicate.list === 'later' ? '「後で買う」' : '注文リスト'}に追加済みです。登録済みの本を編集・移動してください。`; return; }
  const editing = state.editingId && state.books.find(b => b.id === state.editingId);
  if (editing) Object.assign(editing, book);
  else state.books.push({ ...book, id: crypto.randomUUID(), list: 'order' });
  if (!editing) state.activeTab = 'order';
  resetForm(); save(); render();
  notify(editing ? '書籍情報を更新しました。' : '注文リストに追加しました。');
  $('isbn').focus({ preventScroll: true });
});
for (const key of ['name', 'phone']) {
  $(`customer-${key}`).value = state.customer[key];
  $(`customer-${key}`).addEventListener('input', e => { state.customer[key] = e.target.value; save(); });
}

function lookupMessage(message, error = false) { $('lookup-message').textContent = message; $('lookup-message').classList.toggle('error', error); }
function cancelLookup() { clearTimeout(lookupTimer); requestSequence++; controller?.abort(); controller = null; $('lookup-button').disabled = false; $('lookup-button').lastChild.textContent = '書籍情報を取得'; }
$('isbn').value = formatIsbn(state.lookupIsbn);
for (const id of ['isbn', 'book-isbn']) $(id).addEventListener('blur', e => {
  e.target.value = formatIsbn(e.target.value);
  if (id === 'isbn') state.lookupIsbn = e.target.value;
  else state.draft.isbn = e.target.value;
  save();
});
$('isbn').addEventListener('input', e => {
  cancelLookup(); lookupMessage(''); state.lookupIsbn = e.target.value; save();
  if (isValidIsbn(state.lookupIsbn)) lookupTimer = setTimeout(() => lookupBook(), 650);
});
$('lookup-form').addEventListener('submit', e => { e.preventDefault(); clearTimeout(lookupTimer); lookupBook(); });
async function lookupBook() {
  const isbn = normalizeIsbn($('isbn').value);
  if (!isValidIsbn(isbn)) { lookupMessage('ISBNを確認してください。ハイフンを除く10桁または13桁の正しい番号を入力してください。', true); $('isbn').focus(); return; }
  if (state.editingId) { lookupMessage('編集中の内容を保存するか閉じてから、新しい本を検索してください。', true); return; }
  cancelLookup();
  const sequence = requestSequence;
  controller = new AbortController();
  const signal = controller.signal;
  const snapshot = { ...state.draft };
  const timeout = setTimeout(() => controller?.abort(), 12000);
  $('lookup-button').disabled = true;
  $('lookup-button').lastChild.textContent = '取得中…';
  lookupMessage('書籍情報を取得しています…');
  try {
    const response = await fetch(`https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(toIsbn13(isbn))}`, { signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
    if (!response.ok) throw new Error('network');
    const data = await response.json();
    if (sequence !== requestSequence) return;
    const book = bookFromOpenBd(data?.[0], toIsbn13(isbn));
    state.formOpen = true;
    if (!book) {
      if (state.draft.isbn === snapshot.isbn) state.draft.isbn = isbn;
      syncForm(); save();
      lookupMessage('書籍情報が見つかりませんでした。下の欄から手入力で追加できます。', true);
      $('book-title').focus({ preventScroll: true });
      return;
    }
    for (const key of Object.keys(book)) if (state.draft[key] === snapshot[key]) state.draft[key] = book[key];
    syncForm(); save();
    $('source-note').textContent = '書誌情報：openBD。内容と税込価格をご確認ください。';
    lookupMessage(book.price === '' ? '書籍情報を取得しました。税込価格は確認できないため、必要に応じて入力してください。' : '書籍情報を取得しました。内容を確認してリストに追加してください。');
  } catch (error) {
    if (sequence !== requestSequence) return;
    state.formOpen = true;
    if (state.draft.isbn === snapshot.isbn) state.draft.isbn = isbn;
    syncForm(); save();
    lookupMessage(error.name === 'AbortError' ? '取得がタイムアウトしました。再試行するか、手入力してください。' : '書籍情報を取得できませんでした。通信環境を確認するか、手入力してください。', true);
  } finally {
    clearTimeout(timeout);
    if (sequence === requestSequence) { controller = null; $('lookup-button').disabled = false; $('lookup-button').lastChild.textContent = '書籍情報を取得'; }
  }
}

function renderHistory() {
  if (!state.history.length) {
    $('history-list').innerHTML = '<div class="history-empty"><h3>まだ確定した注文票はありません。</h3><p>注文リストの「確定して履歴に保存」から残せます。</p></div>';
    return;
  }
  $('history-list').innerHTML = state.history.map(order => {
    const totals = orderTotals(order.books);
    const stamp = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.confirmedAt));
    return `<article class="history-card" data-history-id="${esc(order.id)}"><div class="history-card-top"><div><time datetime="${esc(order.confirmedAt)}">${esc(stamp)}</time><span class="history-confirmed">確定済み</span></div><strong>${money(totals.total)}</strong></div><p class="history-titles">${esc(order.books.slice(0, 2).map(book => book.title).join(' / '))}${order.books.length > 2 ? ` ほか${order.books.length - 2}冊` : ''}</p><p class="history-meta">${totals.count}冊${order.customer.name ? ` · ${esc(order.customer.name)} 様` : ''}${totals.unknown ? ` · 価格未入力 ${totals.unknown}冊` : ''}</p><div class="history-card-actions"><button type="button" class="button secondary" data-history-action="preview">注文票を確認・再印刷</button><button type="button" class="text-button history-delete" data-history-action="delete" aria-label="${esc(stamp)}の履歴を削除">履歴を削除</button></div></article>`;
  }).join('');
}
function historyFeedback(message, canUndo = false) {
  $('history-feedback-text').textContent = message;
  $('history-feedback').hidden = false;
  $('undo-history-delete').hidden = !canUndo;
}
$('history-button').addEventListener('click', () => { renderHistory(); $('history-dialog').showModal(); });
$('history-list').addEventListener('click', e => {
  const button = e.target.closest('button[data-history-action]');
  if (!button) return;
  const id = button.closest('[data-history-id]').dataset.historyId;
  const order = state.history.find(record => record.id === id);
  if (!order) return;
  if (button.dataset.historyAction === 'preview') { openPreview(order); return; }
  const nextState = { ...state, history: state.history.filter(record => record.id !== id) };
  if (!save(nextState)) { historyFeedback('履歴を削除できませんでした。ブラウザーの保存領域を確認してください。'); return; }
  deletedHistory = order;
  state = nextState;
  render();
  historyFeedback('履歴を1件削除しました。', true);
  $('undo-history-delete').focus();
});
$('undo-history-delete').addEventListener('click', () => {
  if (!deletedHistory) return;
  const history = [...state.history, deletedHistory].sort((a, b) => new Date(b.confirmedAt) - new Date(a.confirmedAt));
  const nextState = { ...state, history };
  if (!save(nextState)) { historyFeedback('履歴を復元できませんでした。', true); return; }
  state = nextState; deletedHistory = null;
  render(); historyFeedback('履歴を元に戻しました。');
  $('history-heading').focus();
});
$('confirm-button').addEventListener('click', () => {
  let nextState;
  try { nextState = confirmOrder(state, crypto.randomUUID(), new Date().toISOString()); }
  catch (error) { notify(error.message); return; }
  // Persist the snapshot and the cleared list together before changing the visible state.
  if (!save(nextState)) { notify('履歴に保存できなかったため、注文リストは確定していません。'); return; }
  state = nextState;
  notify('注文票を確定し、履歴に保存しました。');
  render();
  openPreview(state.history[0]);
});
function openPreview(order = null) {
  previewOrder = order;
  $('preview-heading').textContent = order ? '確定した注文票' : '注文票のプレビュー';
  $('preview-description').textContent = order ? '確定時の内容 / A4・縦' : 'A4・縦 / 注文リストのみを印刷';
  const markup = orderSheetMarkup(order ?? state);
  $('preview-content').innerHTML = markup;
  $('print-root').innerHTML = markup;
  $('preview-dialog').showModal();
}
$('preview-button').addEventListener('click', () => { if (orderTotals(state.books).count) openPreview(); });
$('print-button').addEventListener('click', () => { $('print-root').innerHTML = orderSheetMarkup(previewOrder ?? state); window.print(); });
window.addEventListener('beforeprint', () => { $('print-root').innerHTML = orderSheetMarkup(previewOrder ?? state); });
$('preview-dialog').addEventListener('close', () => { previewOrder = null; $('print-root').innerHTML = orderSheetMarkup(state); });
$('help-button').addEventListener('click', () => $('help-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } }));

syncForm(); render(); updateSaveStatus();
if (storageBlocked) notify('保存データを読み込めないため、自動保存を停止しています。既存データは保持されています。');
