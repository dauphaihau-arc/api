export type UserSseMessage = {
  id?: string;
  type: string;
  data: Record<string, unknown>;
  retry?: number;
};
