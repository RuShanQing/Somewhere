export type PassageRecipientResolution =
  | { ok: true; recipientId: string }
  | { ok: false; reason: 'mismatch' };

/**
 * 绑定共途的草稿只能寄给共途对方。
 * 客户端显式传入的 recipientId 只作为一致性校验，不能扩大收件人范围。
 */
export function resolvePassageRecipient(
  counterpartId: string,
  requestedRecipientId: string | null | undefined,
): PassageRecipientResolution {
  if (
    requestedRecipientId !== undefined &&
    requestedRecipientId !== null &&
    requestedRecipientId !== counterpartId
  ) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true, recipientId: counterpartId };
}
