import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { InviteGuestArtisanDto } from './dto/invite-guest-artisan.dto';
import { GuestArtisansService } from './guest-artisans.service';

@ApiTags('guest-artisans')
@Controller('guest-artisans')
export class GuestArtisansController {
  constructor(private readonly guestArtisans: GuestArtisansService) {}

  @Roles('ADMIN')
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return this.guestArtisans.list(user.tenantId);
  }

  @Roles('ADMIN')
  @Post('invite')
  async invite(@CurrentUser() user: AuthUser, @Body() body: InviteGuestArtisanDto) {
    return this.guestArtisans.invite({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      email: body.email,
      name: body.name,
    });
  }
}
