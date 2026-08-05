export interface GenerateTextInput {
  instructions: string;
  input: string;
  model?: string;
  maxOutputTokens?: number;
}
