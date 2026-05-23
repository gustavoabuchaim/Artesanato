import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { EbooksController } from './ebooks.controller';
import { EbooksService } from './ebooks.service';

@Module({
  imports: [UploadsModule],
  controllers: [EbooksController],
  providers: [EbooksService],
})
export class EbooksModule {}
