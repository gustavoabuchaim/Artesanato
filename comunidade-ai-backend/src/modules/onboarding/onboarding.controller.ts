import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    return this.onboarding.getState(user.tenantId, user.userId);
  }

  @Post('progress')
  async progress(@CurrentUser() user: AuthUser, @Body() body: UpdateOnboardingDto) {
    return this.onboarding.updateState({ tenantId: user.tenantId, userId: user.userId, step: body.step, data: body.data });
  }

  @Post('complete')
  async complete(@CurrentUser() user: AuthUser) {
    return this.onboarding.complete(user.tenantId, user.userId);
  }
}
