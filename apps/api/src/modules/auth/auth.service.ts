import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import {
  isValidEmail,
  isValidNickname,
  isValidPassword,
  normalizeEmail,
  normalizeNickname,
} from './domain/identity';
import { PasswordService } from './password.service';
import { UserRepository } from './repositories/user.repository';
import { SessionService } from './session.service';
import { toSessionUser, type AuthSessionUser, type IssuedSession, type LoginInput, type RegisterInput } from './auth.types';

export interface AuthResult {
  user: AuthSessionUser;
  session: IssuedSession;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const nickname = normalizeNickname(input.nickname);

    if (!isValidEmail(email)) {
      throw AppError.validation(['email:isEmail']);
    }
    if (!isValidPassword(input.password)) {
      throw AppError.validation(['password:length']);
    }
    if (!isValidNickname(nickname)) {
      throw AppError.validation(['nickname:length']);
    }
    if (input.adultConfirmed !== true) {
      throw AppError.validation(['adultConfirmed:mustBeTrue']);
    }

    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.users.create({
      emailNormalized: email,
      passwordHash,
      nickname,
      adultConfirmedAt: new Date(),
    });
    const session = await this.sessions.issue(user.id);

    return { user: toSessionUser(user), session };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const user = isValidEmail(email) ? await this.users.findByNormalizedEmail(email) : null;

    if (!user) {
      await this.passwords.verifyAgainstDummy(input.password);
      throw AppError.invalidCredentials();
    }

    const passwordMatches = await this.passwords.verify(user.passwordHash, input.password);
    if (!passwordMatches) {
      throw AppError.invalidCredentials();
    }

    const session = await this.sessions.rotateForUser(user.id);
    return { user: toSessionUser(user), session };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
  }
}
