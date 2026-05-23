import { Module } from '@nestjs/common';
import { GuestArtisansController } from './guest-artisans.controller';
import { GuestArtisansService } from './guest-artisans.service';

@Module({
  controllers: [GuestArtisansController],
  providers: [GuestArtisansService]
})
export class GuestArtisansModule {}
