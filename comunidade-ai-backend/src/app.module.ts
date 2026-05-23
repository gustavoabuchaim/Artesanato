import { CacheModule } from '@nestjs/cache-manager';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { configuration } from './config/configuration';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ContentModule } from './modules/content/content.module';
import { VideosModule } from './modules/videos/videos.module';
import { EbooksModule } from './modules/ebooks/ebooks.module';
import { MentorshipModule } from './modules/mentorship/mentorship.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { CommunityModule } from './modules/community/community.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AdminModule } from './modules/admin/admin.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { GuestArtisansModule } from './modules/guest-artisans/guest-artisans.module';
import { PrismaModule } from './prisma/prisma.module';
import { CsrfGuard } from './security/csrf.guard';
import { SecurityModule } from './security/security.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { TenantModule } from './tenant/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        redact: {
          paths: [
            'req.headers.cookie',
            'req.headers.authorization',
            'req.headers.x-csrf-token',
            'req.body.password',
            'req.body.token',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL_MS') ?? 60_000,
          limit: config.get<number>('THROTTLE_LIMIT') ?? 120,
        },
      ],
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: 30_000,
    }),
    PrismaModule,
    TenantModule,
    SecurityModule,
    AuthModule,
    UsersModule,
    OnboardingModule,
    DashboardModule,
    SettingsModule,
    ContentModule,
    VideosModule,
    EbooksModule,
    MentorshipModule,
    PurchasesModule,
    NotificationsModule,
    CommunityModule,
    AnalyticsModule,
    AdminModule,
    UploadsModule,
    WebhooksModule,
    GuestArtisansModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
