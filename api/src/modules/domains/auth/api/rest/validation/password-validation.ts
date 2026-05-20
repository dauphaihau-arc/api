import { Matches, MaxLength, MinLength } from 'class-validator';

export const AUTH_PASSWORD_MIN_LENGTH = 8;
export const AUTH_PASSWORD_MAX_LENGTH = 64;
export const AUTH_PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/;

export function IsAuthPassword(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    MinLength(AUTH_PASSWORD_MIN_LENGTH)(target, propertyKey);
    MaxLength(AUTH_PASSWORD_MAX_LENGTH)(target, propertyKey);
    Matches(AUTH_PASSWORD_PATTERN, {
      message:
        'password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character'
    })(target, propertyKey);
  };
}
