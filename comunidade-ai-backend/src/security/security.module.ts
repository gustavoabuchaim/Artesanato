import { Global, Module } from '@nestjs/common';
import { BruteForceService } from './bruteforce.service';
import { CsrfService } from './csrf.service';

@Global()
@Module({
  providers: [BruteForceService, CsrfService],
  exports: [BruteForceService, CsrfService],
})
export class SecurityModule {}

