import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { TenantService } from './tenant/tenant.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const appEnv = (config.get<string>('APP_ENV') ?? 'local').toLowerCase();

  const server: any = app.getHttpAdapter().getInstance();
  const trustProxy = config.get<number>('TRUST_PROXY') ?? 0;
  if (typeof server?.set === 'function') {
    if (trustProxy > 0) server.set('trust proxy', trustProxy);
    if (trustProxy === 0 && appEnv !== 'local') server.set('trust proxy', 1);
  }

  if (typeof server?.disable === 'function') {
    server.disable('x-powered-by');
  }

  const cspEnabled = (config.get<boolean>('CSP_ENABLED') ?? false) || appEnv !== 'local';
  const cspReportOnly = config.get<boolean>('CSP_REPORT_ONLY') ?? false;

  app.use(
    helmet({
      contentSecurityPolicy: cspEnabled
        ? {
            reportOnly: cspReportOnly,
            useDefaults: false,
            directives: {
              defaultSrc: ["'none'"],
              baseUri: ["'none'"],
              frameAncestors: ["'none'"],
              formAction: ["'self'"],
              objectSrc: ["'none'"],
              imgSrc: ["'self'", 'data:'],
              styleSrc: ["'self'"],
              scriptSrc: ["'self'"],
              connectSrc: ["'self'"],
            },
          }
        : false,
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts:
        appEnv === 'local'
          ? false
          : {
              maxAge: 15552000,
              includeSubDomains: true,
              preload: true,
            },
    }),
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    next();
  });
  app.use(compression());
  app.use(cookieParser());

  app.enableShutdownHooks();

  const corsOriginsRaw = (config.get<string>('CORS_ORIGINS') ?? '').trim();
  const corsOrigins = corsOriginsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return cb(null, true);
      if (appEnv === 'local' && corsOrigins.length === 0) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    allowedHeaders: ['content-type', 'x-tenant-slug', 'x-csrf-token'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidUnknownValues: true,
      transform: true,
    }),
  );

  const apiPrefix = config.get<string>('API_PREFIX') ?? 'api';
  app.setGlobalPrefix(apiPrefix);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Comunidade AI API')
    .setDescription('API da plataforma Comunidade AI')
    .setVersion('1.0')
    .addCookieAuth('access_token', { type: 'apiKey', in: 'cookie' })
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  app.use(`/${apiPrefix}/docs`, (req: Request, res: Response, next: NextFunction) => {
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');
    next();
  });

  const port = config.get<number>('PORT') ?? 3005;
  await app.listen(port, '0.0.0.0');

  const tenantService = app.get(TenantService);
  void tenantService.ensureDefaultTenant().catch(() => undefined);
}
bootstrap();
