import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { FilePurpose } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async initUpload(params: {
    tenantId: string;
    userId: string;
    purpose: string;
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
  }) {
    const { client, bucket } = this.getR2Client();

    const purpose = this.parsePurpose(params.purpose);
    const sizeBytes = this.assertSizeBytes(purpose, params.sizeBytes);
    const mimeType = this.assertMimeType(purpose, params.mimeType);

    const r2Key = `${params.tenantId}/${purpose.toLowerCase()}/${crypto.randomUUID()}`;
    const file = await this.prisma.fileObject.create({
      data: {
        tenantId: params.tenantId,
        purpose: purpose as never,
        r2Key,
        mimeType,
        sizeBytes: sizeBytes !== null ? BigInt(sizeBytes) : null,
      },
      select: { id: true, r2Key: true },
    });

    const uploadSession = await this.prisma.uploadSession.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        status: 'INITIATED',
        fileId: file.id,
        filePurpose: purpose as never,
        originalFilename: params.filename,
        expectedSizeBytes: sizeBytes !== null ? BigInt(sizeBytes) : null,
      },
      select: { id: true },
    });

    const ttl = this.config.get<number>('R2_SIGNED_URL_TTL_SECONDS') ?? 900;
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: file.r2Key,
      ContentType: mimeType || undefined,
    });
    const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: ttl });

    return {
      uploadSessionId: uploadSession.id,
      r2Key: file.r2Key,
      uploadUrl,
      method: 'PUT',
      headers: {
        'content-type': mimeType ?? undefined,
      },
    };
  }

  async completeUpload(params: { tenantId: string; userId: string; uploadSessionId: string; checksum?: string }) {
    const upload = await this.prisma.uploadSession.findFirst({
      where: { id: params.uploadSessionId, tenantId: params.tenantId, userId: params.userId },
      select: { id: true, fileId: true, status: true },
    });
    if (!upload) throw new BadRequestException('Upload não encontrado');

    await this.prisma.$transaction([
      this.prisma.uploadSession.update({
        where: { id: upload.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      }),
      upload.fileId
        ? this.prisma.fileObject.update({
            where: { id: upload.fileId },
            data: { checksum: params.checksum ?? undefined },
          })
        : this.prisma.fileObject.updateMany({ where: { id: '00000000-0000-0000-0000-000000000000' }, data: {} }),
    ]);

    return { ok: true };
  }

  async getSignedReadUrl(params: { tenantId: string; r2Key: string; ttlSeconds?: number }) {
    const { client, bucket } = this.getR2Client();

    if (!this.isTenantKey(params.tenantId, params.r2Key)) {
      throw new BadRequestException('Chave inválida');
    }

    const file = await this.prisma.fileObject.findUnique({
      where: { r2Key: params.r2Key },
      select: { tenantId: true, purpose: true },
    });
    if (!file || file.tenantId !== params.tenantId) throw new BadRequestException('Arquivo não encontrado');
    if (file.purpose === 'EBOOK_FILE') throw new BadRequestException('Acesso negado');

    const ttlMax = this.config.get<number>('R2_SIGNED_URL_TTL_SECONDS') ?? 900;
    const ttl = Math.min(params.ttlSeconds ?? ttlMax, ttlMax);
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: params.r2Key });
    return getSignedUrl(client, cmd, { expiresIn: ttl });
  }

  private getR2Client() {
    const accountId = this.config.get<string>('R2_ACCOUNT_ID') || '';
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID') || '';
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY') || '';
    const bucket = this.config.get<string>('R2_BUCKET') || '';

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error('R2 não configurado');
    }

    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });

    return { client, bucket };
  }

  private parsePurpose(raw: string): FilePurpose {
    const normalized = (raw ?? '').toString().trim().toUpperCase();
    const allowed = new Set<string>(Object.values(FilePurpose));
    if (!allowed.has(normalized)) throw new BadRequestException('purpose inválido');
    return normalized as FilePurpose;
  }

  private assertSizeBytes(purpose: FilePurpose, sizeBytes?: number) {
    const maxDefault = this.config.get<number>('UPLOAD_MAX_BYTES_DEFAULT') ?? 25 * 1024 * 1024;
    const maxByPurpose: Record<FilePurpose, number> = {
      AVATAR: 5 * 1024 * 1024,
      COVER: 10 * 1024 * 1024,
      EBOOK_FILE: maxDefault,
      EBOOK_COVER: 10 * 1024 * 1024,
      LESSON_ATTACHMENT: maxDefault,
      COMMUNITY_ATTACHMENT: maxDefault,
      OTHER: maxDefault,
    };

    if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return null;
    }
    const max = Math.min(maxDefault, maxByPurpose[purpose] ?? maxDefault);
    if (sizeBytes > max) throw new BadRequestException('Arquivo muito grande');
    return Math.floor(sizeBytes);
  }

  private assertMimeType(purpose: FilePurpose, mimeType?: string) {
    const raw = (mimeType ?? '').toString().trim().toLowerCase();
    if (!raw) {
      if (purpose === 'OTHER') return null;
      throw new BadRequestException('mimeType obrigatório');
    }

    const allowByPurpose: Record<FilePurpose, Set<string>> = {
      AVATAR: new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
      COVER: new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
      EBOOK_COVER: new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
      EBOOK_FILE: new Set(['application/pdf']),
      LESSON_ATTACHMENT: new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']),
      COMMUNITY_ATTACHMENT: new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']),
      OTHER: new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'text/plain']),
    };

    const allowed = allowByPurpose[purpose] ?? allowByPurpose.OTHER;
    if (!allowed.has(raw)) throw new BadRequestException('mimeType inválido');
    return raw;
  }

  private isTenantKey(tenantId: string, r2Key: string) {
    const prefix = `${tenantId}/`;
    return typeof r2Key === 'string' && r2Key.startsWith(prefix) && r2Key.length > prefix.length;
  }
}
