import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TokenHasher } from '../../app/ports/token-hasher';

@Injectable()
export class Sha256TokenHasher implements TokenHasher {
  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
