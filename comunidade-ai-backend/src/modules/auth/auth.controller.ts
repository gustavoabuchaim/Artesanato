import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CsrfService } from '../../security/csrf.service';
import { RequestWithTenant } from '../../tenant/tenant.middleware';
import { Public } from './auth.decorators';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, RequestPasswordResetDto, ResetPasswordDto } from './dto/auth.dto';
import { REFRESH_TOKEN_COOKIE } from './auth.constants';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly csrf: CsrfService,
  ) {}

  @Public()
  @Get('csrf')
  async csrfToken(@Res({ passthrough: true }) res: Response) {
    const token = this.csrf.issue(res);
    return { token };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @Post('register')
  async register(
    @Req() req: Request & RequestWithTenant,
    @Res({ passthrough: true }) res: Response,
    @Body() body: RegisterDto,
  ) {
    return this.auth.register({
      tenantId: req.tenantId,
      email: body.email,
      password: body.password,
      phone: body.phone,
      name: body.name,
      res,
      userAgent: req.header('user-agent') ?? undefined,
      ip: req.ip,
    });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @Post('login')
  async login(
    @Req() req: Request & RequestWithTenant,
    @Res({ passthrough: true }) res: Response,
    @Body() body: LoginDto,
  ) {
    return this.auth.login({
      tenantId: req.tenantId,
      email: body.email,
      password: body.password,
      res,
      userAgent: req.header('user-agent') ?? undefined,
      ip: req.ip,
    });
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: minutes(1) } })
  @Post('refresh')
  async refresh(
    @Req() req: Request & RequestWithTenant,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (typeof refreshToken !== 'string' || !refreshToken) {
      return this.auth.logout({ res });
    }

    return this.auth.refresh({
      tenantId: req.tenantId,
      refreshToken,
      res,
      userAgent: req.header('user-agent') ?? undefined,
      ip: req.ip,
    });
  }

  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    return this.auth.logout({ refreshToken: typeof refreshToken === 'string' ? refreshToken : undefined, res });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: minutes(5) } })
  @Post('password-reset/request')
  async requestPasswordReset(@Req() req: Request & RequestWithTenant, @Body() body: RequestPasswordResetDto) {
    return this.auth.requestPasswordReset({ tenantId: req.tenantId, email: body.email, ip: req.ip });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: minutes(5) } })
  @Post('password-reset/confirm')
  async resetPassword(
    @Req() req: Request & RequestWithTenant,
    @Res({ passthrough: true }) res: Response,
    @Body() body: ResetPasswordDto,
  ) {
    return this.auth.resetPassword({
      tenantId: req.tenantId,
      token: body.token,
      password: body.password,
      res,
      userAgent: req.header('user-agent') ?? undefined,
      ip: req.ip,
    });
  }
}
