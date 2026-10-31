import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIsbn, isValidIsbn, toIsbn13, formatIsbn, parsePrice, validateDraft, initialState, restoreState, orderTotals, escapeHtml, bookFromOpenBd } from '../core.mjs';

test('ISBNの全角・ハイフン・末尾Xを処理し、チェックディジットを検証する', () => {
  assert.equal(normalizeIsbn('９７８－４－１０－１０１００１－４'), '9784101010014');
  for (const value of ['9784101010014', '4-10-101001-3', '0-8044-2957-X']) assert.equal(isValidIsbn(value), true, value);
  for (const value of ['9784101010015', '978410101001', '1234567890128', 'abcdefghij', '410101001X']) assert.equal(isValidIsbn(value), false, value);
  assert.equal(toIsbn13('4-10-101001-3'), '9784101010014');
  assert.equal(toIsbn13('080442957X'), '9780804429573');
});
test('価格未入力と無料の本を区別し、不正な価格を受け付けない', () => {
  assert.equal(parsePrice(''), null); assert.equal(parsePrice(null), null); assert.equal(parsePrice('0'), 0);
  assert.equal(parsePrice('1234'), 1234);
  for (const value of ['-1', '1.1', 'NaN', 'Infinity', '100000000']) assert.throws(() => parsePrice(value));
});
test('ISBNを国・出版社ごとの可変長の区切りで整形する', () => {
  const examples = [
    ['9784101010014', '978-4-10-101001-4'],
    ['9784873113364', '978-4-87311-336-4'],
    ['9781933988030', '978-1-933988-03-0'],
    ['9791096908028', '979-10-96908-02-8'],
    ['4101010013', '4-10-101001-3'],
    ['080442957x', '0-8044-2957-X'],
    ['９７８－４８７３１１３３６－４', '978-4-87311-336-4'],
    ['978-41-0101001-4', '978-4-10-101001-4']
  ];
  for (const [input, expected] of examples) {
    assert.equal(formatIsbn(input), expected, input);
    assert.equal(formatIsbn(expected), expected, '再整形しても変わらない');
    assert.equal(normalizeIsbn(expected), normalizeIsbn(input));
    assert.equal(isValidIsbn(expected), true);
  }
});
test('不正なISBNや未割り当ての範囲に区切りやチェックディジットを捏造しない', () => {
  for (const value of ['', '9784101010015', '978410101001', '誤入力', '978-4-10-101001-5']) assert.equal(formatIsbn(value), value);
  // Checksum-valid ISBN with no group in the bundled ranges.
  assert.equal(isValidIsbn('9789999999991'), true);
  assert.equal(formatIsbn('9789999999991'), '9789999999991');
});
test('保存済みのISBNもデータを書き換えず整形し、手入力は検索用の数字に正規化する', () => {
  const state = initialState();
  state.books.push({ id: 'saved', list: 'order', title: '保存済みの本', author: '', publisher: '', isbn: '9784873113364', price: null });
  const restored = restoreState(JSON.stringify(state));
  assert.equal(formatIsbn(restored.books[0].isbn), '978-4-87311-336-4');
  assert.equal(restored.books[0].isbn, '9784873113364');
  assert.equal(validateDraft({ title: '本', author: '', publisher: '', isbn: '978-4-87311-336-4', price: '' }).isbn, '9784873113364');
  assert.equal(toIsbn13('4-10-101001-3'), toIsbn13('978-4-10-101001-4'));
});
test('注文リストの金額だけを合算し、価格不明の冊数を表示できる', () => {
  const books = [{ list: 'order', price: 1200 }, { list: 'later', price: 5000 }, { list: 'order', price: null }, { list: 'order', price: 0 }];
  assert.deepEqual(orderTotals(books), { count: 3, total: 1200, unknown: 1 });
  books[0].list = 'later';
  assert.deepEqual(orderTotals(books), { count: 2, total: 0, unknown: 1 });
});
test('任意項目が空欄でも追加できるが、タイトル・ISBN・価格は検証する', () => {
  const draft = { title: ' テストの本 ', author: '', publisher: '', isbn: '', price: '' };
  assert.deepEqual(validateDraft(draft), { title: 'テストの本', author: '', publisher: '', isbn: '', price: null });
  assert.throws(() => validateDraft({ ...draft, title: ' ' }));
  assert.throws(() => validateDraft({ ...draft, isbn: '9784101010015' }));
  assert.throws(() => validateDraft({ ...draft, price: '-5' }));
});
test('注文・後で買う・連絡先・入力中データを保存して復元する', () => {
  const state = initialState();
  state.books = [{ id: 'a', title: '本A', author: '著者A', publisher: '出版社A', isbn: '', price: null, list: 'order' }, { id: 'b', title: '本B', author: '', publisher: '', isbn: '', price: 0, list: 'later' }];
  state.customer = { name: 'テスト 太郎', phone: '000-0000-0000' };
  state.formOpen = true; state.editingId = 'a'; state.activeTab = 'later'; state.lookupIsbn = '9784101010014';
  state.draft.title = '入力中の本';
  assert.deepEqual(restoreState(JSON.stringify(state)), state);
  assert.throws(() => restoreState('{broken'));
  assert.throws(() => restoreState(JSON.stringify({ ...state, version: 99 })));
  assert.throws(() => restoreState(JSON.stringify({ ...state, books: [...state.books, state.books[0]] })));
});
test('openBDの税込価格を取得し、税抜価格や外貨を誤って税込価格にしない', () => {
  const record = { summary: { title: 'APIの本', author: '著者', publisher: '出版社' }, onix: { ProductSupply: { SupplyDetail: { Price: [{ PriceType: '01', CurrencyCode: 'JPY', PriceAmount: '1000' }, { PriceType: '02', CurrencyCode: 'JPY', PriceAmount: '1100' }] } } } };
  assert.equal(bookFromOpenBd(record, '9784101010014').price, '1100');
  record.onix.ProductSupply.SupplyDetail.Price.pop();
  assert.equal(bookFromOpenBd(record, '9784101010014').price, '');
  record.onix.ProductSupply.SupplyDetail.Price = [{ PriceType: '02', CurrencyCode: 'USD', PriceAmount: '10' }];
  assert.equal(bookFromOpenBd(record, '9784101010014').price, '');
  assert.equal(bookFromOpenBd(null, '9784101010014'), null);
});
test('手入力・API入力をHTMLとして実行しない', () => {
  assert.equal(escapeHtml('<script>"&\'</script>'), '&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;');
});
