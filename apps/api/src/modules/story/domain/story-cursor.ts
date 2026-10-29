const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface StoryCursor {
  /** 公开列表使用 publishedAt；审核队列使用 submittedAt。 */
  at: Date;
  id: string;
}

export function encodeStoryCursor(cursor: StoryCursor): string {
  return Buffer.from(`${cursor.at.toISOString()}|${cursor.id}`, 'utf8').toString('base64url');
}

/** 非法游标返回 null，由 DTO/服务层统一转成 422。 */
export function decodeStoryCursor(raw: string | undefined): StoryCursor | null {
  if (!raw) {
    return null;
  }
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const separator = decoded.lastIndexOf('|');
    if (separator <= 0) {
      return null;
    }
    const datePart = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    const at = new Date(datePart);
    if (Number.isNaN(at.getTime()) || !UUID_PATTERN.test(id)) {
      return null;
    }
    return { at, id };
  } catch {
    return null;
  }
}
