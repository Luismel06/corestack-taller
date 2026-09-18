import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@qorvex/database';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    const configuredLimit = process.env.DATABASE_CONNECTION_LIMIT;
    const localDefaultLimit = process.env.NODE_ENV === 'production' ? undefined : '5';
    const connectionLimit = parseConnectionLimit(configuredLimit ?? localDefaultLimit);

    super(
      databaseUrl && connectionLimit
        ? {
            datasources: {
              db: { url: withConnectionLimit(databaseUrl, connectionLimit) },
            },
          }
        : undefined,
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

function parseConnectionLimit(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? String(parsed) : undefined;
}

function withConnectionLimit(databaseUrl: string, connectionLimit: string) {
  if (/([?&])connection_limit=\d+/i.test(databaseUrl)) {
    return databaseUrl.replace(
      /([?&]connection_limit=)\d+/i,
      `$1${connectionLimit}`,
    );
  }
  return `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}connection_limit=${connectionLimit}`;
}
