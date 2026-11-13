import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LANGUAGE, parseLanguage, translate } from '../src/i18n';

test('language defaults to English and rejects unsupported saved values', () => {
  assert.equal(DEFAULT_LANGUAGE, 'en');
  assert.equal(parseLanguage(undefined), 'en');
  assert.equal(parseLanguage('zh'), 'en');
  assert.equal(parseLanguage('ja'), 'ja');
});

test('translations select the requested language', () => {
  assert.equal(translate('en', 'loading'), 'Loading…');
  assert.equal(translate('ja', 'loading'), '読み込み中…');
});

import en from '../src/locales/en.json';
import ja from '../src/locales/ja.json';
import zhCN from '../src/locales/zh-CN.json';
import ko from '../src/locales/ko.json';
import { setLanguage, t, subscribeLanguage, LANGUAGES, locale } from '../src/i18n';
import { STATUS } from '../src/model';
import { PROPERTY_LABELS } from '../src/task';
import { renderCreatedNote } from '../src/create';

test('dictionaries have matching keys and interpolation parameters', () => {
  for (const dictionary of [en, zhCN, ko]) {
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(ja).sort());
    for (const key of Object.keys(ja) as (keyof typeof ja)[]) {
      assert.deepEqual(dictionary[key].match(/\{\d+\}/g)?.sort() ?? [], ja[key].match(/\{\d+\}/g)?.sort() ?? [], key);
      assert.ok(dictionary[key].trim().length, key);
    }
  }
});

test('language changes notify subscribers and update status/property labels', () => {
  setLanguage('en');
  let calls = 0;
  const stop = subscribeLanguage(() => { calls++; });
  assert.equal(STATUS.todo.label, en['未着手']);
  assert.equal(PROPERTY_LABELS.target_date, 'Scheduled date');
  setLanguage('ja');
  assert.equal(calls, 1);
  assert.equal(STATUS.todo.label, '未着手');
  assert.equal(PROPERTY_LABELS.target_date, '予定日');
  stop();
  setLanguage('en');
  assert.equal(calls, 1);
  assert.equal(t('「{0}」のノートをゴミ箱に移します。', '日本語 {0}'), 'Move “日本語 {0}” to the trash.');
});

test('language does not change the note format, custom properties, or user content', () => {
  const template = '---\n{"tags":["task"],"custom":"日本語"}\n---\n\n## Notes\n\n## 派生タスク(Child Tasks)\n';
  const render = () => renderCreatedNote(template, 'task', {status:'todo',target_date:'2026-11-13'}, '日本語のメモ', '2026-11-13', {parse:JSON.parse,stringify:JSON.stringify});
  setLanguage('ja'); const japanese = render();
  for (const language of LANGUAGES) {
    setLanguage(language);
    assert.equal(render(), japanese, language);
  }
  const english = render();
  assert.ok(english.includes('日本語のメモ'));
  assert.ok(english.includes('派生タスク'));
});


test('Chinese and Korean use their dictionaries, locales, and interpolated values', () => {
  try {
    setLanguage('zh-CN');
    assert.equal(parseLanguage('zh-CN'), 'zh-CN');
    assert.equal(locale(), 'zh-CN');
    assert.equal(STATUS.todo.label, '未开始');
    assert.equal(PROPERTY_LABELS.target_date, '计划日期');
    assert.equal(translate('zh-CN', 'loading'), '正在加载…');
    assert.equal(t('「{0}」のノートをゴミ箱に移します。', '日本語 {0}'), '将笔记“日本語 {0}”移至回收站。');
    setLanguage('ko');
    assert.equal(parseLanguage('ko'), 'ko');
    assert.equal(locale(), 'ko-KR');
    assert.equal(STATUS.todo.label, '시작 전');
    assert.equal(PROPERTY_LABELS.target_date, '예정일');
    assert.equal(translate('ko', 'loading'), '불러오는 중…');
    assert.equal(t('{0}年{1}月{2}日{3}', 2026, 11, 13, ''), '2026년 11월 13일');
    assert.doesNotThrow(() => new Intl.DateTimeFormat(locale(), {weekday:'short'}).format(new Date()));
  } finally { setLanguage('en'); }
});
