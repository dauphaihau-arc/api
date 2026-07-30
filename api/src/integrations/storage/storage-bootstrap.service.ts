import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { StorageService } from './app/ports/storage.service';

@Injectable()
export class StorageBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(StorageBootstrapService.name);

  constructor(private readonly storageService: StorageService) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Pinging storage backend during bootstrap');

    try {
      await this.storageService.ping();
      this.logger.log('Storage bootstrap ping succeeded');
    }
    catch (error) {
      this.logger.error('Storage bootstrap failed', error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }
}
