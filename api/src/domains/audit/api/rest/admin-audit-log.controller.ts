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
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { ListAuditLogsUseCase } from '../../app/use-cases/list-audit-logs/list-audit-logs.use-case';
import {
  ExportAuditLogsQueryDto,
  ListAuditLogsQueryDto,
} from './dto/list-audit-logs.query.dto';
import { adminAuditLogControllerErrorResponses } from './errors/audit-log-error-responses';
import {
  AuditLogListResponseDto,
  toAuditLogListResponse,
} from './responses/audit-log.response';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('audit.read')
@ApiTags('Admin Audit Logs')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(adminAuditLogControllerErrorResponses.controller)
export class AdminAuditLogController {
  constructor(
    private readonly listAuditLogsUseCase: ListAuditLogsUseCase,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List audit logs' })
  @ApiQuery({
    name: 'action',
    required: false,
    style: 'form',
    explode: false,
    description:
      'Action filter. Send a comma-separated list (`action=user.created,user.updated`); repeating the parameter is also accepted.',
  })
  @ApiQuery({
    name: 'entity_type',
    required: false,
    style: 'form',
    explode: false,
    description:
      'Entity type filter. Send a comma-separated list (`entity_type=user,order`); repeating the parameter is also accepted.',
  })
  @ApiOkResponse({
    description: 'Paginated audit trail across audited entity types.',
    type: AuditLogListResponseDto,
  })
  @ApiErrorResponses(adminAuditLogControllerErrorResponses.list)
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
  @ApiOperation({
    summary: 'Export audit logs as CSV',
    description:
      'Returns up to the newest 10,000 entries matching the filters as a CSV attachment.',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'Audit log entries as a UTF-8 CSV attachment.',
    headers: {
      'Content-Disposition': {
        description: 'Attachment filename suggested for the download.',
        schema: { type: 'string' },
      },
    },
    content: {
      'text/csv': {
        schema: { type: 'string' },
      },
    },
  })
  @ApiErrorResponses(adminAuditLogControllerErrorResponses.export)
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
