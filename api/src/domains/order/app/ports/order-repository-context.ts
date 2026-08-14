import type { EntityManager } from '@mikro-orm/postgresql';

export interface OrderRepositoryContext {
  entityManager?: EntityManager;
}
