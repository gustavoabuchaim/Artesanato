import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { ContentService } from './content.service';

@ApiTags('content')
@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('courses')
  async courses(@CurrentUser() user: AuthUser) {
    return this.content.listCourses(user.tenantId);
  }

  @Get('courses/:id')
  async course(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.content.getCourse({ tenantId: user.tenantId, userId: user.userId, courseId: id });
  }
}
