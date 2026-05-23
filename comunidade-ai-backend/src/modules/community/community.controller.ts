import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { PaginationQueryDto } from '../../shared/pagination.dto';
import { CommunityService } from './community.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ModerateDto } from './dto/moderate.dto';
import { ReportDto } from './dto/report.dto';
import { ReactDto } from './dto/react.dto';

@ApiTags('community')
@Controller('community')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('spaces')
  async spaces(@CurrentUser() user: AuthUser) {
    return this.community.listSpaces({ tenantId: user.tenantId, userId: user.userId });
  }

  @Get('feed')
  async feed(
    @CurrentUser() user: AuthUser,
    @Query('spaceId') spaceId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.community.feed({
      tenantId: user.tenantId,
      userId: user.userId,
      spaceId,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('spaces/:spaceId/posts')
  async listPosts(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.community.listPosts({
      tenantId: user.tenantId,
      userId: user.userId,
      spaceId,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('my/posts')
  async myPosts(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.community.myPosts({
      tenantId: user.tenantId,
      userId: user.userId,
      status,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('posts')
  async create(@CurrentUser() user: AuthUser, @Body() body: CreatePostDto) {
    return this.community.createPost({
      tenantId: user.tenantId,
      userId: user.userId,
      spaceId: body.spaceId,
      title: body.title,
      body: body.body,
      attachmentFileId: body.attachmentFileId,
    });
  }

  @Get('posts/:postId')
  async getPost(@CurrentUser() user: AuthUser, @Param('postId') postId: string) {
    return this.community.getPost({ tenantId: user.tenantId, userId: user.userId, postId });
  }

  @Post('posts/:postId/comments')
  async addComment(@CurrentUser() user: AuthUser, @Param('postId') postId: string, @Body() body: CreateCommentDto) {
    return this.community.addComment({
      tenantId: user.tenantId,
      userId: user.userId,
      postId,
      body: body.body,
      parentCommentId: body.parentCommentId,
      attachmentFileId: body.attachmentFileId,
    });
  }

  @Post('posts/:postId/react')
  async react(@CurrentUser() user: AuthUser, @Param('postId') postId: string, @Body() body: ReactDto) {
    return this.community.reactToPost({ tenantId: user.tenantId, userId: user.userId, postId, kind: body.kind });
  }

  @Post('comments/:commentId/react')
  async reactToComment(@CurrentUser() user: AuthUser, @Param('commentId') commentId: string, @Body() body: ReactDto) {
    return this.community.reactToComment({ tenantId: user.tenantId, userId: user.userId, commentId, kind: body.kind });
  }

  @Post('posts/:postId/report')
  async reportPost(@CurrentUser() user: AuthUser, @Param('postId') postId: string, @Body() body: ReportDto) {
    return this.community.reportPost({
      tenantId: user.tenantId,
      userId: user.userId,
      postId,
      reason: body.reason,
      details: body.details,
    });
  }

  @Post('comments/:commentId/report')
  async reportComment(@CurrentUser() user: AuthUser, @Param('commentId') commentId: string, @Body() body: ReportDto) {
    return this.community.reportComment({
      tenantId: user.tenantId,
      userId: user.userId,
      commentId,
      reason: body.reason,
      details: body.details,
    });
  }

  @Patch('posts/:postId/moderate')
  async moderatePost(@CurrentUser() user: AuthUser, @Param('postId') postId: string, @Body() body: ModerateDto) {
    return this.community.moderatePost({
      tenantId: user.tenantId,
      userId: user.userId,
      postId,
      action: body.action,
      reason: body.reason,
    });
  }

  @Patch('comments/:commentId/moderate')
  async moderateComment(@CurrentUser() user: AuthUser, @Param('commentId') commentId: string, @Body() body: ModerateDto) {
    return this.community.moderateComment({
      tenantId: user.tenantId,
      userId: user.userId,
      commentId,
      action: body.action,
      reason: body.reason,
    });
  }
}
