import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BruteForceService } from '../../security/bruteforce.service';
import { cookieDomain, cookieSameSite, isSecureCookie } from '../../security/cookie.options';
import { CSRF_COOKIE } from '../../security/csrf.constants';
import { CsrfService } from '../../security/csrf.service';
import { TenantService } from '../../tenant/tenant.service';
import { UsersService } from '../users/users.service';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './auth.constants';
import { signAccessToken } from './jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly tenantService: TenantService,
    private readonly config: ConfigService,
    private readonly csrf: CsrfService,
    private readonly bruteForce: BruteForceService,
    private readonly logger: PinoLogger,
  ) {}

  async register(params: {
    tenantId?: string;
    email: string;
    password: string;
    name?: string;
    phone?: string;
    res: Response;
    userAgent?: string;
    ip?: string;
  }) {
    try {
      const tenantId = await this.resolveTenantId(params.tenantId);

      const bfKey = this.bruteforceKey({
        action: 'register',
        tenantId,
        email: params.email,
        ip: params.ip,
      });
      await this.bruteForce.assertAllowed(bfKey);

      const existing = await this.users.findByEmail(tenantId, params.email);
      if (existing) {
        await this.bruteForce.recordFailure(bfKey);
        throw new BadRequestException('E-mail já cadastrado');
      }

      const isFirstUser = (await this.prisma.user.count({ where: { tenantId } })) === 0;
      const passwordHash = await this.hashPassword(params.password);
      const user = await this.users.createUser({
        tenantId,
        email: params.email,
        name: params.name,
        phone: params.phone,
        passwordHash,
      });

      if (isFirstUser) {
        const role = await this.prisma.role.upsert({
          where: { tenantId_key: { tenantId, key: 'ADMIN' } },
          update: { name: 'Admin' },
          create: { tenantId, key: 'ADMIN', name: 'Admin', scope: 'TENANT' },
          select: { id: true },
        });
        await this.prisma.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: role.id } },
          update: {},
          create: { tenantId, userId: user.id, roleId: role.id },
          select: { id: true },
        });
      }

      await this.issueSession({
        tenantId,
        userId: user.id,
        res: params.res,
        userAgent: params.userAgent,
        ip: params.ip,
      });

      await this.prisma.outboxEvent.create({
        data: {
          tenantId,
          topic: 'user.registered',
          payload: { userId: user.id },
        },
        select: { id: true },
      });

      await this.bruteForce.reset(bfKey);
      return user;
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof UnauthorizedException) throw e;

      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') throw new BadRequestException('E-mail já cadastrado');
        if (e.code === 'P2021') {
          throw new ServiceUnavailableException('Banco de dados não inicializado. Rode as migrações do Prisma e reinicie o backend.');
        }
      }

      if (e instanceof Prisma.PrismaClientInitializationError) {
        throw new ServiceUnavailableException('Banco de dados indisponível. Verifique o Postgres e a variável DATABASE_URL.');
      }

      const message = e instanceof Error ? e.message : '';
      if (
        /can(?:not|')t reach database server/i.test(message) ||
        /connection refused/i.test(message) ||
        /connect timeout/i.test(message) ||
        /does not exist/i.test(message)
      ) {
        throw new ServiceUnavailableException('Banco de dados indisponível. Verifique o Postgres e rode as migrações.');
      }

      throw e;
    }
  }

  async login(params: {
    tenantId?: string;
    email: string;
    password: string;
    res: Response;
    userAgent?: string;
    ip?: string;
  }) {
    const tenantId = await this.resolveTenantId(params.tenantId);

    const bfKey = this.bruteforceKey({
      action: 'login',
      tenantId,
      email: params.email,
      ip: params.ip,
    });

    await this.bruteForce.assertAllowed(bfKey);

    const user = await this.users.findByEmail(tenantId, params.email);
    if (!user?.credential) {
      await this.bruteForce.recordFailure(bfKey);
      this.logger.warn({ event: 'auth.login_failed', tenantId, ip: params.ip }, 'Login failed');
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const ok = await this.verifyPassword(params.password, user.credential.passwordHash);
    if (!ok) {
      await this.bruteForce.recordFailure(bfKey);
      this.logger.warn({ event: 'auth.login_failed', tenantId, userId: user.id, ip: params.ip }, 'Login failed');
      throw new UnauthorizedException('Credenciais inválidas');
    }

    await this.bruteForce.reset(bfKey);

    await this.issueSession({
      tenantId,
      userId: user.id,
      res: params.res,
      userAgent: params.userAgent,
      ip: params.ip,
    });

    return { id: user.id, tenantId: user.tenantId, email: user.email, name: user.name };
  }

  async refresh(params: { tenantId?: string; refreshToken: string; res: Response; userAgent?: string; ip?: string }) {
    const tenantId = await this.resolveTenantId(params.tenantId);
    const tokenHash = this.sha256Hex(params.refreshToken);

    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: tokenHash },
      select: { id: true, userId: true, status: true, expiresAt: true, tenantId: true },
    });

    if (!session || session.status !== 'ACTIVE') {
      this.logger.warn({ event: 'auth.refresh_failed', tenantId, ip: params.ip }, 'Refresh failed');
      throw new UnauthorizedException();
    }
    if (session.tenantId !== tenantId) {
      this.logger.warn({ event: 'auth.refresh_failed', tenantId, ip: params.ip }, 'Refresh failed (tenant mismatch)');
      throw new UnauthorizedException();
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED', revokedAt: new Date() },
        select: { id: true },
      });
      this.logger.warn({ event: 'auth.refresh_failed', tenantId, userId: session.userId, ip: params.ip }, 'Refresh expired');
      throw new UnauthorizedException();
    }

    const newRefreshToken = this.generateToken();
    const newHash = this.sha256Hex(newRefreshToken);
    const refreshTtlSeconds = this.config.get<number>('JWT_REFRESH_TTL_SECONDS') ?? 60 * 60 * 24 * 30;
    const newExpiresAt = new Date(Date.now() + refreshTtlSeconds * 1000);

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newHash,
        lastUsedAt: new Date(),
        expiresAt: newExpiresAt,
        userAgent: params.userAgent,
        ip: params.ip,
      },
      select: { id: true },
    });

    await this.setAuthCookies({
      tenantId,
      userId: session.userId,
      refreshToken: newRefreshToken,
      res: params.res,
    });

    return { ok: true };
  }

  async logout(params: { refreshToken?: string; res: Response }) {
    if (params.refreshToken) {
      const tokenHash = this.sha256Hex(params.refreshToken);
      await this.prisma.userSession.updateMany({
        where: { refreshTokenHash: tokenHash, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
    }
    this.clearAuthCookies(params.res);
    return { ok: true };
  }

  async requestPasswordReset(params: { tenantId?: string; email: string; ip?: string }) {
    const tenantId = await this.resolveTenantId(params.tenantId);
    const bfKey = this.bruteforceKey({ action: 'password_reset_request', tenantId, email: params.email, ip: params.ip });
    await this.bruteForce.assertAllowed(bfKey);

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: params.email.toLowerCase() } },
      select: { id: true },
    });
    if (!user) {
      await this.bruteForce.recordFailure(bfKey);
      return { ok: true };
    }

    const token = this.generateToken();
    const tokenHash = this.sha256Hex(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { tenantId, userId: user.id, tokenHash, expiresAt },
      select: { id: true },
    });

    await this.prisma.outboxEvent.create({
      data: {
        tenantId,
        topic: 'user.password_reset_requested',
        payload: { userId: user.id, token },
      },
      select: { id: true },
    });

    await this.bruteForce.reset(bfKey);
    return { ok: true };
  }

  async resetPassword(params: { tenantId?: string; token: string; password: string; res: Response; userAgent?: string; ip?: string }) {
    const tenantId = await this.resolveTenantId(params.tenantId);
    const tokenHash = this.sha256Hex(params.token);

    const bfKey = this.bruteforceKey({ action: 'password_reset_confirm', tenantId, email: tokenHash, ip: params.ip });
    await this.bruteForce.assertAllowed(bfKey);

    const prt = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true, tenantId: true },
    });
    if (!prt || prt.tenantId !== tenantId) {
      await this.bruteForce.recordFailure(bfKey);
      throw new BadRequestException('Token inválido');
    }
    if (prt.usedAt) {
      await this.bruteForce.recordFailure(bfKey);
      throw new BadRequestException('Token já utilizado');
    }
    if (prt.expiresAt.getTime() <= Date.now()) {
      await this.bruteForce.recordFailure(bfKey);
      throw new BadRequestException('Token expirado');
    }

    const passwordHash = await this.hashPassword(params.password);

    await this.prisma.$transaction([
      this.prisma.userCredential.update({ where: { userId: prt.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: prt.id }, data: { usedAt: new Date() } }),
      this.prisma.userSession.updateMany({ where: { tenantId, userId: prt.userId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } }),
    ]);

    await this.issueSession({
      tenantId,
      userId: prt.userId,
      res: params.res,
      userAgent: params.userAgent,
      ip: params.ip,
    });

    await this.bruteForce.reset(bfKey);
    return { ok: true };
  }

  private async issueSession(params: { tenantId: string; userId: string; res: Response; userAgent?: string; ip?: string }) {
    const refreshToken = this.generateToken();
    const refreshHash = this.sha256Hex(refreshToken);
    const refreshTtlSeconds = this.config.get<number>('JWT_REFRESH_TTL_SECONDS') ?? 60 * 60 * 24 * 30;

    await this.prisma.userSession.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        refreshTokenHash: refreshHash,
        expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
        userAgent: params.userAgent,
        ip: params.ip,
      },
      select: { id: true },
    });

    await this.setAuthCookies({
      tenantId: params.tenantId,
      userId: params.userId,
      refreshToken,
      res: params.res,
    });
  }

  private async setAuthCookies(params: { tenantId: string; userId: string; refreshToken: string; res: Response }) {
    const accessSecret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!accessSecret) throw new Error('JWT_ACCESS_SECRET não configurado');

    const accessTtlSeconds = this.config.get<number>('JWT_ACCESS_TTL_SECONDS') ?? 900;
    const accessToken = await signAccessToken({
      secret: accessSecret,
      payload: { sub: params.userId, tenantId: params.tenantId },
      ttlSeconds: accessTtlSeconds,
    });

    const secure = isSecureCookie(this.config);
    const domain = cookieDomain(this.config);
    const sameSite = cookieSameSite(this.config);

    params.res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: sameSite === 'none' ? true : secure,
      sameSite,
      domain,
      path: '/',
      maxAge: accessTtlSeconds * 1000,
    });

    const refreshTtlSeconds = this.config.get<number>('JWT_REFRESH_TTL_SECONDS') ?? 60 * 60 * 24 * 30;
    params.res.cookie(REFRESH_TOKEN_COOKIE, params.refreshToken, {
      httpOnly: true,
      secure: sameSite === 'none' ? true : secure,
      sameSite,
      domain,
      path: '/',
      maxAge: refreshTtlSeconds * 1000,
    });

    this.csrf.issue(params.res);
  }

  private clearAuthCookies(res: Response) {
    const secure = isSecureCookie(this.config);
    const domain = cookieDomain(this.config);
    const sameSite = cookieSameSite(this.config);

    res.cookie(ACCESS_TOKEN_COOKIE, '', { httpOnly: true, secure: sameSite === 'none' ? true : secure, sameSite, domain, path: '/', maxAge: 0 });
    res.cookie(REFRESH_TOKEN_COOKIE, '', { httpOnly: true, secure: sameSite === 'none' ? true : secure, sameSite, domain, path: '/', maxAge: 0 });
    res.cookie(CSRF_COOKIE, '', { httpOnly: false, secure: sameSite === 'none' ? true : secure, sameSite, domain, path: '/', maxAge: 0 });
  }

  private generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  private sha256Hex(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private async hashPassword(password: string) {
    const cost = this.config.get<number>('BCRYPT_COST') ?? 12;
    const rounds = Math.max(12, Math.min(15, cost));
    return bcrypt.hash(password, rounds);
  }

  private async verifyPassword(password: string, passwordHash: string) {
    try {
      return await bcrypt.compare(password, passwordHash);
    } catch {
      return false;
    }
  }

  private bruteforceKey(params: { action: string; tenantId: string; email?: string; ip?: string }) {
    const email = (params.email ?? '').toLowerCase().trim();
    const ip = (params.ip ?? '').toString().trim();
    return `bf:${params.action}:${params.tenantId}:${email}:${ip}`;
  }

  private async resolveTenantId(tenantId?: string) {
    if (tenantId) return tenantId;
    const t = await this.tenantService.getDefaultTenant();
    if (t) return t.id;
    return this.tenantService.ensureDefaultTenant();
  }
}
