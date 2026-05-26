export type SseMessage = {
  id?: string;
  type: string;
  data: Record<string, unknown>;
  retry?: number;
};
