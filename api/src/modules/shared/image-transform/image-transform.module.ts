import { Module } from '@nestjs/common';
import { ImageTransformService } from './app/ports/image-transform.service';
import { SharpImageTransformService } from './infra/sharp-image-transform.service';

@Module({
  providers: [
    {
      provide: ImageTransformService,
      useClass: SharpImageTransformService,
    },
  ],
  exports: [ImageTransformService],
})
export class ImageTransformModule {}
