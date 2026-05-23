export class PrismaClient {
  constructor(_options?: any) {}
  async $connect() {}
  async $disconnect() {}
}

export const Prisma = {
  sql: (..._args: any[]) => ({}),
};

export const FilePurpose = {
  COMMUNITY_ATTACHMENT: 'COMMUNITY_ATTACHMENT',
  UPLOAD: 'UPLOAD',
  EBOOK: 'EBOOK',
  CAROUSEL_IMAGE: 'CAROUSEL_IMAGE',
  LESSON_ATTACHMENT: 'LESSON_ATTACHMENT',
} as const;

