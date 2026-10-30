import { describe, expect, it } from 'vitest';
import {
  PERSONAL_MEMORY_BODY_MAX,
  PERSONAL_MEMORY_TITLE_MAX,
  validatePersonalMemoryCreate,
  validatePersonalMemoryUpdate,
} from '../../src/modules/memory/domain/personal-memory';

describe('MEMORY · 个人记忆标题与正文校验', () => {
  it('接受最短标题与正文并去除首尾空白', () => {
    const result = validatePersonalMemoryCreate({ title: ' 海 ', body: ' 风 ' });
    expect(result).toEqual({ ok: true, value: { title: '海', body: '风' } });
  });

  it('接受标题 80 与正文 3000 的边界', () => {
    expect(
      validatePersonalMemoryCreate({
        title: '海'.repeat(PERSONAL_MEMORY_TITLE_MAX),
        body: '风'.repeat(PERSONAL_MEMORY_BODY_MAX),
      }).ok,
    ).toBe(true);
  });

  it('拒绝标题 81 与正文 3001', () => {
    expect(
      validatePersonalMemoryCreate({
        title: '海'.repeat(PERSONAL_MEMORY_TITLE_MAX + 1),
        body: '风',
      }),
    ).toEqual({ ok: false, details: ['title:tooLong'] });

    expect(
      validatePersonalMemoryCreate({
        title: '海',
        body: '风'.repeat(PERSONAL_MEMORY_BODY_MAX + 1),
      }),
    ).toEqual({ ok: false, details: ['body:tooLong'] });
  });

  it('拒绝全空白、换行或制表符组成的标题与正文', () => {
    expect(validatePersonalMemoryCreate({ title: ' \n\t ', body: '风' })).toEqual({
      ok: false,
      details: ['title:required'],
    });
    expect(validatePersonalMemoryCreate({ title: '海', body: '\n\t ' })).toEqual({
      ok: false,
      details: ['body:required'],
    });
  });

  it('按码点计数，emoji 的 80/81 边界与中文一致', () => {
    expect(
      validatePersonalMemoryCreate({
        title: '🌊'.repeat(PERSONAL_MEMORY_TITLE_MAX),
        body: '风',
      }).ok,
    ).toBe(true);
    expect(
      validatePersonalMemoryCreate({
        title: '🌊'.repeat(PERSONAL_MEMORY_TITLE_MAX + 1),
        body: '风',
      }),
    ).toEqual({ ok: false, details: ['title:tooLong'] });
  });

  it('更新允许只改一个字段，但拒绝空更新与空白值', () => {
    expect(validatePersonalMemoryUpdate({ title: '新的标题' })).toEqual({
      ok: true,
      value: { title: '新的标题' },
    });
    expect(validatePersonalMemoryUpdate({})).toEqual({
      ok: false,
      details: ['update:empty'],
    });
    expect(validatePersonalMemoryUpdate({ body: '   ' })).toEqual({
      ok: false,
      details: ['body:required'],
    });
  });
});
