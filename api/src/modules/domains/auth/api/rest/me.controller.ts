import {
  Body,
  Controller,
  Header,
  Patch,
  UseGuards
} from '@nestjs/common';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../app/auth.types';
import { UpdateCurrentUserPreferencesUseCase } from '../../app/use-cases/update-current-user-preferences/update-current-user-preferences.use-case';
import { JwtAuthGuard } from '../guard/jwt-auth.guard';
import { PermissionsGuard } from '../guard/permissions.guard';
import { MeResponseDto } from './dto/me-response.dto';
import { UpdateMeDto } from './dto/update-me.dto';

@Controller('me')
export class MeController {
  constructor(
    private readonly updateCurrentUserPreferencesUseCase: UpdateCurrentUserPreferencesUseCase
  ) {}

  @Patch()
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  async updateMe(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: UpdateMeDto
  ): Promise<MeResponseDto> {
    return MeResponseDto.fromUserProfile(
      await this.updateCurrentUserPreferencesUseCase.execute(currentUser, {
        preferences: body.preferences,
      })
    );
  }
}
