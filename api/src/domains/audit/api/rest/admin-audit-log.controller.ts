import {
  Controller,
  Get,
  Header,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiCookieAuth,
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { ListAuditLogsUseCase } from '../../app/use-cases/list-audit-logs/list-audit-logs.use-case';
import {
  ExportAuditLogsQueryDto,
  ListAuditLogsQueryDto,
} from './dto/list-audit-logs.query.dto';
import {
  AuditLogListResponseDto,
  toAuditLogListResponse,
} from './responses/audit-log.response';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('audit.read')
@ApiExcludeController()
@ApiTags('Admin Audit Logs')
@ApiCookieAuth('accessCookie')
export class AdminAuditLogController {
  constructor(
    private readonly listAuditLogsUseCase: ListAuditLogsUseCase,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List audit logs' })
  @ApiOkResponse({
    description: 'Paginated audit trail across audited entity types.',
    type: AuditLogListResponseDto,
  })
  async list(@Query() query: ListAuditLogsQueryDto) {
    return toAuditLogListResponse(
      await this.listAuditLogsUseCase.execute({
        page: query.page,
        limit: query.limit,
        search: query.search,
        action: query.action,
        actorEmail: query.actor_email,
        entityId: query.entity_id,
        entityType: query.entity_type,
      }),
    );
  }

  @Get('export')
  @ApiOperation({ summary: 'Export audit logs as CSV' })
  @ApiProduces('text/csv')
  async export(
    @Query() query: ExportAuditLogsQueryDto,
    @Res() response: Response,
  ) {
    const csv = await this.listAuditLogsUseCase.exportCsv({
      search: query.search,
      action: query.action,
      actorEmail: query.actor_email,
      entityId: query.entity_id,
      entityType: query.entity_type,
    });

    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="audit-logs.csv"',
    );
    response.send(csv);
  }
}
