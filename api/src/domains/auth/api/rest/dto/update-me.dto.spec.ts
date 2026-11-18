import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMeDto } from './update-me.dto';

async function validatePreferences(language: string) {
  const dto = plainToInstance(UpdateMeDto, {
    preferences: { language },
  });

  return validate(dto);
}

describe('UpdateMeDto preferences language', () => {
  it('accepts the Storefront Languages', async () => {
    await expect(validatePreferences('en')).resolves.toHaveLength(0);
    await expect(validatePreferences('vi')).resolves.toHaveLength(0);
  });

  it('rejects the retired languages', async () => {
    await expect(validatePreferences('la')).resolves.toHaveLength(1);
    await expect(validatePreferences('fr')).resolves.toHaveLength(1);
  });

  it('rejects an unknown language value', async () => {
    const errors = await validatePreferences('xx');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('preferences');
  });
});
