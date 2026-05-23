import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { PaginationQueryDto } from '../../shared/pagination.dto';
import { AdminService } from './admin.service';
import { GrantEntitlementDto } from './dto/grant-entitlement.dto';

class AdminListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Length(0, 200)
  query?: string;
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(0, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  status?: string;
}

class SetUserRolesDto {
  @IsArray()
  @IsString({ each: true })
  roleKeys!: string[];
}

class UpsertCourseDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  status?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  visibility?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  coverFileId?: string;
}

class CreateModuleDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

class CreateLessonDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  type?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

class PublishDto {
  @IsString()
  @Length(2, 12)
  published!: string;
}

class UpsertEbookDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  status?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  coverFileId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  fileId?: string;
}

class ListOrdersDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Length(0, 24)
  status?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  provider?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  query?: string;
}

class ListUploadsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Length(0, 32)
  status?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  purpose?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  query?: string;
}

class UpsertCarouselDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  subtitle?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  ctaLabel?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  ctaUrl?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  imageFileId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  mobileImageFileId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  backgroundColor?: string;
}

class UpsertCurationDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsString()
  @Length(1, 2000)
  url!: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  tag?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  status?: string;
}

class UpsertMentorshipOfferDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  status?: string;
}

class SendNotificationDto {
  @IsString()
  @Length(1, 64)
  userId!: string;

  @IsString()
  @Length(1, 64)
  type!: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  body?: string;
}

class BroadcastNotificationDto {
  @IsString()
  @Length(1, 64)
  type!: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  body?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;
}

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Roles('ADMIN')
  @Get('metrics')
  async metrics(@CurrentUser() user: AuthUser) {
    return this.admin.metrics(user.tenantId);
  }

  @Roles('ADMIN')
  @Get('analytics/overview')
  async analyticsOverview(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    const n = days ? Number(days) : 30;
    return this.admin.analyticsOverview({ tenantId: user.tenantId, days: Number.isFinite(n) ? n : 30 });
  }

  @Roles('ADMIN')
  @Get('analytics/timeseries')
  async analyticsTimeseries(@CurrentUser() user: AuthUser, @Query('metric') metric: string, @Query('days') days?: string) {
    const n = days ? Number(days) : 30;
    return this.admin.analyticsTimeseries({ tenantId: user.tenantId, metric, days: Number.isFinite(n) ? n : 30 });
  }

  @Roles('ADMIN')
  @Get('analytics/funnel')
  async analyticsFunnel(@CurrentUser() user: AuthUser, @Query('name') name: string, @Query('days') days?: string) {
    const n = days ? Number(days) : 30;
    return this.admin.analyticsFunnel({ tenantId: user.tenantId, name, days: Number.isFinite(n) ? n : 30 });
  }

  @Roles('ADMIN')
  @Get('search')
  async search(@CurrentUser() user: AuthUser, @Query('query') query: string) {
    return this.admin.adminSearch({ tenantId: user.tenantId, query: query ?? '' });
  }

  @Roles('ADMIN')
  @Get('users')
  async users(@CurrentUser() user: AuthUser, @Query() query: AdminListQueryDto, @Query('status') status?: string, @Query('roleKey') roleKey?: string) {
    return this.admin.listUsers({
      tenantId: user.tenantId,
      page: query.page,
      limit: query.limit,
      query: query.query,
      status,
      roleKey,
    });
  }

  @Roles('ADMIN')
  @Patch('users/:id')
  async updateUser(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.admin.updateUser({ tenantId: user.tenantId, actorUserId: user.userId, userId: id, name: body.name, status: body.status });
  }

  @Roles('ADMIN')
  @Post('users/:id/roles')
  async setUserRoles(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: SetUserRolesDto) {
    return this.admin.setUserRoles({ tenantId: user.tenantId, actorUserId: user.userId, userId: id, roleKeys: body.roleKeys });
  }

  @Roles('ADMIN')
  @Get('content/courses')
  async listCourses(@CurrentUser() user: AuthUser, @Query() query: AdminListQueryDto, @Query('status') status?: string) {
    return this.admin.listCourses({ tenantId: user.tenantId, page: query.page, limit: query.limit, query: query.query, status });
  }

  @Roles('ADMIN')
  @Post('content/courses/:id/modules')
  async createModule(@CurrentUser() user: AuthUser, @Param('id') courseId: string, @Body() body: CreateModuleDto) {
    return this.admin.createCourseModule({ tenantId: user.tenantId, actorUserId: user.userId, courseId, title: body.title, sortOrder: body.sortOrder });
  }

  @Roles('ADMIN')
  @Post('content/modules/:id/lessons')
  async createLesson(@CurrentUser() user: AuthUser, @Param('id') moduleId: string, @Body() body: CreateLessonDto) {
    return this.admin.createLesson({ tenantId: user.tenantId, actorUserId: user.userId, moduleId, title: body.title, type: body.type, status: body.status, sortOrder: body.sortOrder });
  }

  @Roles('ADMIN')
  @Get('videos/lessons')
  async listLessons(@CurrentUser() user: AuthUser, @Query() query: AdminListQueryDto, @Query('status') status?: string, @Query('courseId') courseId?: string) {
    return this.admin.listLessons({ tenantId: user.tenantId, page: query.page, limit: query.limit, query: query.query, status, courseId });
  }

  @Roles('ADMIN')
  @Post('content/courses')
  async createCourse(@CurrentUser() user: AuthUser, @Body() body: UpsertCourseDto) {
    return this.admin.upsertCourse({ tenantId: user.tenantId, actorUserId: user.userId, title: body.title, description: body.description, status: body.status, visibility: body.visibility, coverFileId: body.coverFileId });
  }

  @Roles('ADMIN')
  @Patch('content/courses/:id')
  async updateCourse(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpsertCourseDto) {
    return this.admin.upsertCourse({ tenantId: user.tenantId, actorUserId: user.userId, courseId: id, title: body.title, description: body.description, status: body.status, visibility: body.visibility, coverFileId: body.coverFileId });
  }

  @Roles('ADMIN')
  @Post('content/courses/:id/publish')
  async publishCourse(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: PublishDto) {
    const published = body.published === 'true';
    return this.admin.setCoursePublished({ tenantId: user.tenantId, actorUserId: user.userId, courseId: id, published });
  }

  @Roles('ADMIN')
  @Get('ebooks')
  async listEbooks(@CurrentUser() user: AuthUser, @Query() query: AdminListQueryDto, @Query('status') status?: string) {
    return this.admin.listEbooks({ tenantId: user.tenantId, page: query.page, limit: query.limit, query: query.query, status });
  }

  @Roles('ADMIN')
  @Post('ebooks')
  async createEbook(@CurrentUser() user: AuthUser, @Body() body: UpsertEbookDto) {
    return this.admin.upsertEbook({ tenantId: user.tenantId, actorUserId: user.userId, title: body.title, description: body.description, status: body.status, coverFileId: body.coverFileId, fileId: body.fileId });
  }

  @Roles('ADMIN')
  @Patch('ebooks/:id')
  async updateEbook(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpsertEbookDto) {
    return this.admin.upsertEbook({ tenantId: user.tenantId, actorUserId: user.userId, ebookId: id, title: body.title, description: body.description, status: body.status, coverFileId: body.coverFileId, fileId: body.fileId });
  }

  @Roles('ADMIN')
  @Post('ebooks/:id/publish')
  async publishEbook(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: PublishDto) {
    const published = body.published === 'true';
    return this.admin.setEbookPublished({ tenantId: user.tenantId, actorUserId: user.userId, ebookId: id, published });
  }

  @Roles('ADMIN')
  @Get('orders')
  async listOrders(@CurrentUser() user: AuthUser, @Query() query: ListOrdersDto) {
    return this.admin.listOrders({
      tenantId: user.tenantId,
      page: query.page,
      limit: query.limit,
      status: query.status,
      provider: query.provider,
      query: query.query,
    });
  }

  @Roles('ADMIN')
  @Get('curation')
  async listCuration(@CurrentUser() user: AuthUser, @Query() query: AdminListQueryDto, @Query('status') status?: string) {
    return this.admin.listCuration({ tenantId: user.tenantId, page: query.page, limit: query.limit, query: query.query, status });
  }

  @Roles('ADMIN')
  @Post('curation')
  async createCuration(@CurrentUser() user: AuthUser, @Body() body: UpsertCurationDto) {
    return this.admin.upsertCuration({ tenantId: user.tenantId, actorUserId: user.userId, ...body });
  }

  @Roles('ADMIN')
  @Patch('curation/:id')
  async updateCuration(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpsertCurationDto) {
    return this.admin.upsertCuration({ tenantId: user.tenantId, actorUserId: user.userId, itemId: id, ...body });
  }

  @Roles('ADMIN')
  @Delete('curation/:id')
  async deleteCuration(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.deleteCuration({ tenantId: user.tenantId, actorUserId: user.userId, itemId: id });
  }

  @Roles('ADMIN')
  @Get('mentorship/offers')
  async listMentorshipOffers(@CurrentUser() user: AuthUser, @Query() query: AdminListQueryDto, @Query('status') status?: string) {
    return this.admin.listMentorshipOffersAdmin({ tenantId: user.tenantId, page: query.page, limit: query.limit, query: query.query, status });
  }

  @Roles('ADMIN')
  @Post('mentorship/offers')
  async createMentorshipOffer(@CurrentUser() user: AuthUser, @Body() body: UpsertMentorshipOfferDto) {
    return this.admin.upsertMentorshipOffer({ tenantId: user.tenantId, actorUserId: user.userId, name: body.name, description: body.description, status: body.status });
  }

  @Roles('ADMIN')
  @Patch('mentorship/offers/:id')
  async updateMentorshipOffer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpsertMentorshipOfferDto) {
    return this.admin.upsertMentorshipOffer({ tenantId: user.tenantId, actorUserId: user.userId, offerId: id, name: body.name, description: body.description, status: body.status });
  }

  @Roles('ADMIN')
  @Post('notifications/send')
  async sendNotification(@CurrentUser() user: AuthUser, @Body() body: SendNotificationDto) {
    return this.admin.sendNotification({ tenantId: user.tenantId, actorUserId: user.userId, userId: body.userId, type: body.type, title: body.title, body: body.body });
  }

  @Roles('ADMIN')
  @Post('notifications/broadcast')
  async broadcastNotification(@CurrentUser() user: AuthUser, @Body() body: BroadcastNotificationDto) {
    return this.admin.broadcastNotification({ tenantId: user.tenantId, actorUserId: user.userId, type: body.type, title: body.title, body: body.body, limit: body.limit });
  }

  @Roles('ADMIN')
  @Get('uploads')
  async uploads(@CurrentUser() user: AuthUser, @Query() query: ListUploadsDto) {
    return this.admin.listUploads({
      tenantId: user.tenantId,
      page: query.page,
      limit: query.limit,
      status: query.status,
      purpose: query.purpose,
      query: query.query,
    });
  }

  @Roles('ADMIN')
  @Get('carousel')
  async carousel(@CurrentUser() user: AuthUser, @Query() query: AdminListQueryDto, @Query('status') status?: string) {
    return this.admin.listCarousel({ tenantId: user.tenantId, page: query.page, limit: query.limit, query: query.query, status });
  }

  @Roles('ADMIN')
  @Post('carousel')
  async createCarousel(@CurrentUser() user: AuthUser, @Body() body: UpsertCarouselDto) {
    return this.admin.upsertCarouselItem({ tenantId: user.tenantId, actorUserId: user.userId, ...body });
  }

  @Roles('ADMIN')
  @Patch('carousel/:id')
  async updateCarousel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpsertCarouselDto) {
    return this.admin.upsertCarouselItem({ tenantId: user.tenantId, actorUserId: user.userId, itemId: id, ...body });
  }

  @Roles('ADMIN')
  @Delete('carousel/:id')
  async deleteCarousel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.deleteCarouselItem({ tenantId: user.tenantId, actorUserId: user.userId, itemId: id });
  }

  @Roles('ADMIN')
  @Post('entitlements/grant')
  async grant(@CurrentUser() user: AuthUser, @Body() body: GrantEntitlementDto) {
    return this.admin.grantEntitlement({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      userId: body.userId,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      sourceRef: body.sourceRef,
    });
  }
}
