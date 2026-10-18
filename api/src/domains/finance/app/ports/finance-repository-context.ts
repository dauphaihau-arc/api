import type { EntityManager } from '@mikro-orm/postgresql';

/**
 * Lets a caller hand a repository the EntityManager of an in-flight transaction
 * so the repository's write joins that transaction instead of opening its own.
 */
export interface FinanceRepositoryContext {
  entityManager?: EntityManager;
}
