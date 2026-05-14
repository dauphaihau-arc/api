import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { StorageService } from './app/ports/storage.service';

@Injectable()
export class StorageBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(StorageBootstrapService.name);

  constructor(private readonly storageService: StorageService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.storageService.ping();
    }
    catch (error) {
      this.logger.error('Storage bootstrap failed', error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }
}
