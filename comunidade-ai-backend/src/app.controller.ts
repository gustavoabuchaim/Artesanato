import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/auth/auth.decorators';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return { ok: true };
  }
}
