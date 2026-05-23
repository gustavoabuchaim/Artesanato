import { CommunityService } from './community.service';

describe('CommunityService', () => {
  it('should track community.post_created on createPost', async () => {
    const prisma: any = {
      userRole: { findFirst: jest.fn(async () => null) },
      communityMember: { findFirst: jest.fn(async () => ({ role: 'MEMBER' })), upsert: jest.fn(async () => ({ id: 'm1' })) },
      communitySpace: { findFirst: jest.fn(async () => ({ id: 's1' })) },
      fileObject: { findFirst: jest.fn(async () => ({ id: 'f1' })) },
      communityPost: { create: jest.fn(async () => ({ id: 'p1' })) },
      analyticsEvent: { create: jest.fn(async () => ({ id: 'a1' })) },
    };

    const service = new CommunityService(prisma);
    jest.spyOn(service, 'getPost').mockResolvedValue({ id: 'p1' } as any);

    const res = await service.createPost({
      tenantId: 't1',
      userId: 'u1',
      spaceId: 's1',
      title: 't',
      body: 'b',
      attachmentFileId: 'f1',
    });

    expect(res.id).toBe('p1');
    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'community.post_created' }),
      }),
    );
  });

  it('should track community.comment_created and enqueue outbox on addComment', async () => {
    const prisma: any = {
      userRole: { findFirst: jest.fn(async () => null) },
      communityMember: { findFirst: jest.fn(async () => ({ role: 'MEMBER' })), upsert: jest.fn(async () => ({ id: 'm1' })) },
      communityPost: { findFirst: jest.fn(async () => ({ id: 'p1', spaceId: 's1', authorId: 'u2', status: 'PUBLISHED' })) },
      communityComment: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({ id: 'c1', authorId: 'u1', parentCommentId: null })) },
      notification: { createMany: jest.fn(async () => ({ count: 1 })) },
      outboxEvent: { createMany: jest.fn(async () => ({ count: 1 })) },
      analyticsEvent: { create: jest.fn(async () => ({ id: 'a1' })) },
      fileObject: { findFirst: jest.fn(async () => ({ id: 'f1' })) },
    };

    const service = new CommunityService(prisma);
    const res = await service.addComment({
      tenantId: 't1',
      userId: 'u1',
      postId: 'p1',
      body: 'hello',
      attachmentFileId: 'f1',
    });

    expect(res.ok).toBe(true);
    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'community.comment_created' }),
      }),
    );
    expect(prisma.outboxEvent.createMany).toHaveBeenCalled();
  });
});

