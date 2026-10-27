import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { AUTH_REQUIRED_PERMISSIONS_KEY } from '~/platform/decorators/require-permissions.decorator';
import { RolesController } from './roles.controller';

describe('RolesController', () => {
  it('requires the roles.read permission', () => {
    expect(
      Reflect.getMetadata(AUTH_REQUIRED_PERMISSIONS_KEY, RolesController),
    ).toEqual(['roles.read']);
  });

  it('exposes GET /roles', () => {
    expect(Reflect.getMetadata(PATH_METADATA, RolesController)).toBe('roles');
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        RolesController.prototype.list,
      ),
    ).toBe('/');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        RolesController.prototype.list,
      ),
    ).toBe(RequestMethod.GET);
  });

  it('returns the roles envelope', async () => {
    const roles = [
      { key: 'admin', name: 'Admin' },
      { key: 'customer', name: 'Customer' },
    ];
    const controller = new RolesController({
      execute: jest.fn().mockResolvedValue(roles),
    } as never);

    await expect(controller.list()).resolves.toEqual({ roles });
  });
});
