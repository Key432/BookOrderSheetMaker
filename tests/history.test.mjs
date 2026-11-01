import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, confirmOrder, restoreState, orderTotals } from '../core.mjs';
import { orderSheetMarkup } from '../sheet.mjs';

function exampleState() {
  const state = initialState();
  state.books = [
    { id: 'a', list: 'order', title: '確定する本', author: '著者A', publisher: '出版社A', isbn: '9784101010014', price: 1200 },
    { id: 'b', list: 'later', title: '後で買う本', author: '', publisher: '', isbn: '', price: 5000 },
    { id: 'c', list: 'order', title: '価格不明の本', author: '', publisher: '', isbn: '', price: null }
  ];
  state.customer = { name: '確定時の名前', phone: '000-1111-2222' };
  state.draft.title = '入力途中の本'; state.formOpen = true;
  return state;
}
const confirmedAt = '2025-04-12T03:00:00.000Z';

test('確定で注文の本だけを履歴に移し、後で買う・連絡先・未追加の入力は残す', () => {
  const source = exampleState();
  const before = structuredClone(source);
  const next = confirmOrder(source, 'order-1', confirmedAt);
  assert.deepEqual(source, before, '保存成功前の元データを変更しない');
  assert.deepEqual(next.books.map(book => book.id), ['b']);
  assert.deepEqual(next.history[0].books.map(book => book.id), ['a', 'c']);
  assert.deepEqual(orderTotals(next.history[0].books), { count: 2, total: 1200, unknown: 1 });
  assert.deepEqual(next.customer, source.customer);
  assert.deepEqual(next.draft, source.draft);
  assert.equal(next.formOpen, true);
  assert.equal(next.history[0].confirmedAt, confirmedAt);
});

test('確定時の書籍・価格・注文者情報を独立して保存する', () => {
  const source = exampleState();
  const next = confirmOrder(source, 'order-1', confirmedAt);
  source.books[0].title = '変更後の本'; source.books[0].price = 9999;
  next.customer.name = '現在の名前'; next.customer.phone = '別の電話番号';
  assert.equal(next.history[0].books[0].title, '確定する本');
  assert.equal(next.history[0].books[0].price, 1200);
  assert.equal(next.history[0].customer.name, '確定時の名前');
  assert.equal(next.history[0].customer.phone, '000-1111-2222');
});

test('旧データを保持して履歴を追加でき、確定後も再読み込みできる', () => {
  const old = exampleState(); delete old.history;
  const migrated = restoreState(JSON.stringify(old));
  assert.deepEqual(migrated.history, []);
  assert.deepEqual(migrated.books, old.books);
  const confirmed = confirmOrder(migrated, 'order-1', confirmedAt);
  assert.deepEqual(restoreState(JSON.stringify(confirmed)), confirmed);
  assert.throws(() => restoreState(JSON.stringify({ ...confirmed, history: [{ ...confirmed.history[0], confirmedAt: 'invalid' }] })));
  assert.throws(() => restoreState(JSON.stringify({ ...confirmed, history: [{ ...confirmed.history[0], books: [] }] })));
});

test('空の注文・編集中・重複ID・不正な日時では確定しない', () => {
  assert.throws(() => confirmOrder(initialState(), 'empty', confirmedAt));
  const source = exampleState(); source.editingId = 'a';
  assert.throws(() => confirmOrder(source, 'editing', confirmedAt));
  source.editingId = null;
  assert.throws(() => confirmOrder(source, 'invalid-date', 'invalid'));
  assert.throws(() => confirmOrder(source, 'null-date', null));
  source.history = confirmOrder(source, 'same-id', confirmedAt).history;
  assert.throws(() => confirmOrder(source, 'same-id', confirmedAt));
});

test('履歴の注文票には確定日と保存時の内容を使い、後で買うは含めない', () => {
  const next = confirmOrder(exampleState(), 'order-1', confirmedAt);
  next.customer.name = '現在の名前'; next.books[0].title = '現在の本';
  const markup = orderSheetMarkup(next.history[0]);
  assert.match(markup, /2025年4月12日/);
  assert.match(markup, /確定時の名前/);
  assert.match(markup, /000-1111-2222/);
  assert.match(markup, /¥1,200/);
  assert.match(markup, /978-4-10-101001-4/);
  assert.match(markup, /価格未記入の1冊/);
  assert.doesNotMatch(markup, /現在の名前|現在の本|後で買う本/);
});
