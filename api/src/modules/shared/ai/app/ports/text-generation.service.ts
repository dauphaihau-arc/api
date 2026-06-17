import type { GenerateTextInput } from '../ai.types';

export abstract class TextGenerationService {
  abstract generateText(input: GenerateTextInput): Promise<string>;
}
