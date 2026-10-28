export const RECEPTION_MODES = ['OPEN', 'RESTING', 'CLOSED'] as const;

export type ReceptionModeValue = (typeof RECEPTION_MODES)[number];

export function isReceptionMode(value: unknown): value is ReceptionModeValue {
  return typeof value === 'string' && (RECEPTION_MODES as readonly string[]).includes(value);
}

/** 只有 OPEN 允许新的陌生人通信；RESTING / CLOSED 均不接收新信。 */
export function canReceiveNewMail(mode: ReceptionModeValue): boolean {
  return mode === 'OPEN';
}
