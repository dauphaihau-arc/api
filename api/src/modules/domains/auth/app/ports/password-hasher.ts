export abstract class PasswordHasher {
  abstract hash(value: string): Promise<string>;
  abstract matches(rawValue: string, hashedValue: string): Promise<boolean>;
}
