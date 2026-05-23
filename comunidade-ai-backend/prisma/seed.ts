import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

async function main() {
  const connectionString = (process.env.DATABASE_URL ?? '').trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL não configurado');
  }
  const adapter = new PrismaPg(connectionString);
  const prisma = new PrismaClient({ adapter });
  const slug = (process.env.DEFAULT_TENANT_SLUG ?? 'default').trim() || 'default';

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: { slug, name: 'Comunidade AI' },
    select: { id: true, slug: true },
  });

  const adminRole = await prisma.role.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: 'ADMIN' } },
    update: { name: 'Admin' },
    create: { tenantId: tenant.id, key: 'ADMIN', name: 'Admin' },
    select: { id: true, key: true },
  });

  await prisma.role.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: 'MEMBER' } },
    update: { name: 'Member' },
    create: { tenantId: tenant.id, key: 'MEMBER', name: 'Member' },
    select: { id: true },
  });

  await prisma.role.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: 'MODERATOR' } },
    update: { name: 'Moderator' },
    create: { tenantId: tenant.id, key: 'MODERATOR', name: 'Moderator' },
    select: { id: true },
  });

  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@comunidade.ai').toLowerCase();
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: { name: 'Admin' },
    create: { tenantId: tenant.id, email: adminEmail, name: 'Admin', status: 'ACTIVE' },
    select: { id: true, email: true },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { tenantId: tenant.id, userId: admin.id, roleId: adminRole.id },
    select: { id: true },
  });

  await prisma.communitySpace.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Geral' } },
    update: { name: 'Geral', status: 'PUBLISHED' },
    create: { tenantId: tenant.id, name: 'Geral', description: 'Discussões gerais', status: 'PUBLISHED' },
    select: { id: true },
  });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
});
