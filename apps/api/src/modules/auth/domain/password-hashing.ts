import argon2 from 'argon2';

/** OWASP 建议的 Argon2id 基线参数（19 MiB / 2 迭代 / 单并行度）。 */
export const PASSWORD_HASH_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, PASSWORD_HASH_OPTIONS);
}

export async function verifyPassword(passwordHash: string, plainPassword: string): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, plainPassword);
  } catch {
    return false;
  }
}
