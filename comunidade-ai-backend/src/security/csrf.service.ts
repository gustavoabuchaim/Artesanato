import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { Response } from 'express';
import { CSRF_COOKIE } from './csrf.constants';
import { cookieDomain, cookieSameSite, isSecureCookie } from './cookie.options';

@Injectable()
export class CsrfService {
  constructor(private readonly config: ConfigService) {}

  issue(res: Response) {
    const token = crypto.randomBytes(32).toString('hex');
    const secure = isSecureCookie(this.config);
    const domain = cookieDomain(this.config);
    const sameSite = cookieSameSite(this.config);

    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: sameSite === 'none' ? true : secure,
      sameSite,
      domain,
      path: '/',
      maxAge: 60 * 60 * 24 * 30 * 1000,
    });

    return token;
  }
}
