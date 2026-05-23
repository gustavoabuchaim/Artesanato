import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { SetSettingDto } from './dto/set-setting.dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Roles('ADMIN')
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return this.settings.list(user.tenantId);
  }

  @Roles('ADMIN')
  @Put()
  async set(@CurrentUser() user: AuthUser, @Body() body: SetSettingDto) {
    return this.settings.set(user.tenantId, body.key, body.value);
  }
}
