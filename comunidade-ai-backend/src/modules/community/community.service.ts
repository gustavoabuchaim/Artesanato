import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getPagination } from '../../shared/pagination.dto';

@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService) {}

  private async isTenantAdmin(tenantId: string, userId: string) {
    const role = await this.prisma.userRole.findFirst({
      where: { tenantId, userId, role: { key: 'ADMIN' } },
      select: { id: true },
    });
    return Boolean(role);
  }

  private async getMemberRole(tenantId: string, spaceId: string, userId: string) {
    const member = await this.prisma.communityMember.findFirst({
      where: { tenantId, spaceId, userId },
      select: { role: true },
    });
    return member?.role ?? null;
  }

  private async assertCanModerateSpace(tenantId: string, spaceId: string, userId: string) {
    if (await this.isTenantAdmin(tenantId, userId)) return;
    const role = await this.getMemberRole(tenantId, spaceId, userId);
    if (role === 'ADMIN' || role === 'MODERATOR') return;
    throw new ForbiddenException();
  }

  private async ensureMember(tenantId: string, spaceId: string, userId: string) {
    await this.prisma.communityMember.upsert({
      where: { spaceId_userId: { spaceId, userId } },
      update: {},
      create: { tenantId, spaceId, userId },
      select: { id: true },
    });
  }

  private async assertAttachment(tenantId: string, fileId: string) {
    const file = await this.prisma.fileObject.findFirst({
      where: { tenantId, id: fileId, purpose: 'COMMUNITY_ATTACHMENT' },
      select: { id: true },
    });
    if (!file) throw new BadRequestException('invalid_attachment');
  }

  async listSpaces(params: { tenantId: string; userId: string }) {
    let spaces = await this.prisma.communitySpace.findMany({
      where: { tenantId: params.tenantId, status: 'PUBLISHED' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true },
    });

    if (!spaces.length) {
      await this.prisma.communitySpace.upsert({
        where: { tenantId_name: { tenantId: params.tenantId, name: 'Geral' } },
        update: { status: 'PUBLISHED' },
        create: { tenantId: params.tenantId, name: 'Geral', description: 'Espaço geral da comunidade', status: 'PUBLISHED' },
        select: { id: true },
      });

      spaces = await this.prisma.communitySpace.findMany({
        where: { tenantId: params.tenantId, status: 'PUBLISHED' },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, description: true },
      });
    }

    const memberRoles = spaces.length
      ? await this.prisma.communityMember.findMany({
          where: { tenantId: params.tenantId, userId: params.userId, spaceId: { in: spaces.map((s) => s.id) } },
          select: { spaceId: true, role: true },
        })
      : [];
    const roleBySpaceId = new Map(memberRoles.map((m) => [m.spaceId, m.role]));

    return spaces.map((s) => ({ ...s, myRole: roleBySpaceId.get(s.id) ?? null }));
  }

  async feed(params: { tenantId: string; userId: string; spaceId?: string; cursor?: string; limit?: number }) {
    const take = Math.min(Math.max(params.limit ?? 20, 1), 30);
    const where = {
      tenantId: params.tenantId,
      status: 'PUBLISHED' as const,
      ...(params.spaceId ? { spaceId: params.spaceId } : {}),
    };

    const items = await this.prisma.communityPost.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
      select: {
        id: true,
        spaceId: true,
        title: true,
        body: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        pinnedAt: true,
        attachmentFileId: true,
        attachment: { select: { r2Key: true, mimeType: true } },
        author: { select: { id: true, name: true } },
        space: { select: { id: true, name: true } },
        _count: { select: { comments: true, reactions: true } },
      },
    });

    const postIds = items.map((p) => p.id);
    const reacted = postIds.length
      ? await this.prisma.reaction.findMany({
          where: { tenantId: params.tenantId, userId: params.userId, postId: { in: postIds }, kind: 'LIKE' },
          select: { postId: true },
        })
      : [];
    const reactedSet = new Set(reacted.map((r) => r.postId).filter(Boolean) as string[]);

    return {
      items: items.map((p) => ({
        ...p,
        likeCount: p._count.reactions,
        commentCount: p._count.comments,
        viewerHasLiked: reactedSet.has(p.id),
      })),
      nextCursor: items.length === take ? items[items.length - 1]?.id : null,
    };
  }

  async listPosts(params: { tenantId: string; userId: string; spaceId: string; page?: number; limit?: number }) {
    const { skip, take } = getPagination({ page: params.page, limit: params.limit });

    const [items, total] = await Promise.all([
      this.prisma.communityPost.findMany({
        where: { tenantId: params.tenantId, spaceId: params.spaceId, status: 'PUBLISHED' },
        orderBy: [{ pinnedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          title: true,
          body: true,
          createdAt: true,
          pinnedAt: true,
          attachmentFileId: true,
          attachment: { select: { r2Key: true, mimeType: true } },
          author: { select: { id: true, name: true } },
          _count: { select: { comments: true, reactions: true } },
        },
      }),
      this.prisma.communityPost.count({ where: { tenantId: params.tenantId, spaceId: params.spaceId, status: 'PUBLISHED' } }),
    ]);

    const postIds = items.map((p) => p.id);
    const liked = postIds.length
      ? await this.prisma.reaction.findMany({
          where: { tenantId: params.tenantId, userId: params.userId, postId: { in: postIds }, kind: 'LIKE' },
          select: { postId: true },
        })
      : [];
    const likedSet = new Set(liked.map((r) => r.postId).filter(Boolean) as string[]);

    return {
      items: items.map((p) => ({
        ...p,
        likeCount: p._count.reactions,
        commentCount: p._count.comments,
        viewerHasLiked: likedSet.has(p.id),
      })),
      total,
      page: params.page ?? 1,
      limit: take,
    };
  }

  async getPost(params: { tenantId: string; userId: string; postId: string }) {
    const post = await this.prisma.communityPost.findFirst({
      where: { tenantId: params.tenantId, id: params.postId },
      select: {
        id: true,
        spaceId: true,
        title: true,
        body: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        pinnedAt: true,
        attachmentFileId: true,
        attachment: { select: { r2Key: true, mimeType: true } },
        authorId: true,
        author: { select: { id: true, name: true } },
        _count: { select: { reactions: true } },
      },
    });
    if (!post) throw new NotFoundException();

    if (post.status !== 'PUBLISHED') {
      const canModerate = await this.isTenantAdmin(params.tenantId, params.userId);
      if (!canModerate && post.authorId !== params.userId) {
        await this.assertCanModerateSpace(params.tenantId, post.spaceId, params.userId);
      }
    }

    const [comments, postLiked] = await Promise.all([
      this.prisma.communityComment.findMany({
        where: { tenantId: params.tenantId, postId: post.id, status: 'PUBLISHED' },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          body: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          parentCommentId: true,
          attachmentFileId: true,
          attachment: { select: { r2Key: true, mimeType: true } },
          authorId: true,
          author: { select: { id: true, name: true } },
          _count: { select: { reactions: true } },
        },
      }),
      this.prisma.reaction.findFirst({
        where: { tenantId: params.tenantId, userId: params.userId, postId: post.id, kind: 'LIKE' },
        select: { id: true },
      }),
    ]);

    const commentIds = comments.map((c) => c.id);
    const commentLiked = commentIds.length
      ? await this.prisma.reaction.findMany({
          where: { tenantId: params.tenantId, userId: params.userId, commentId: { in: commentIds }, kind: 'LIKE' },
          select: { commentId: true },
        })
      : [];
    const likedCommentSet = new Set(commentLiked.map((r) => r.commentId).filter(Boolean) as string[]);

    const nodes = new Map<string, any>();
    const roots: any[] = [];
    for (const c of comments) {
      nodes.set(c.id, {
        ...c,
        likeCount: c._count.reactions,
        viewerHasLiked: likedCommentSet.has(c.id),
        replies: [],
      });
    }
    for (const c of comments) {
      const node = nodes.get(c.id);
      if (!node) continue;
      if (c.parentCommentId && nodes.has(c.parentCommentId)) {
        nodes.get(c.parentCommentId).replies.push(node);
      } else {
        roots.push(node);
      }
    }

    return {
      id: post.id,
      spaceId: post.spaceId,
      title: post.title,
      body: post.body,
      status: post.status,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      pinnedAt: post.pinnedAt,
      attachmentFileId: post.attachmentFileId,
      attachment: post.attachment,
      author: post.author,
      likeCount: post._count.reactions,
      viewerHasLiked: Boolean(postLiked),
      comments: roots,
    };
  }

  async myPosts(params: { tenantId: string; userId: string; status?: string; cursor?: string; limit?: number }) {
    const take = Math.min(Math.max(params.limit ?? 20, 1), 30);
    const requestedStatus = params.status?.toUpperCase();
    const where: any = {
      tenantId: params.tenantId,
      authorId: params.userId,
      status:
        !requestedStatus || requestedStatus === 'ALL'
          ? { in: ['PUBLISHED', 'ARCHIVED', 'HIDDEN', 'UNDER_REVIEW'] }
          : requestedStatus,
    };

    const items = await this.prisma.communityPost.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
      select: {
        id: true,
        spaceId: true,
        title: true,
        body: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        pinnedAt: true,
        attachmentFileId: true,
        attachment: { select: { r2Key: true, mimeType: true } },
        author: { select: { id: true, name: true } },
        space: { select: { id: true, name: true } },
        _count: { select: { comments: true, reactions: true } },
      },
    });

    const postIds = items.map((p) => p.id);
    const reacted = postIds.length
      ? await this.prisma.reaction.findMany({
          where: { tenantId: params.tenantId, userId: params.userId, postId: { in: postIds }, kind: 'LIKE' },
          select: { postId: true },
        })
      : [];
    const reactedSet = new Set(reacted.map((r) => r.postId).filter(Boolean) as string[]);

    return {
      items: items.map((p) => ({
        ...p,
        likeCount: p._count.reactions,
        commentCount: p._count.comments,
        viewerHasLiked: reactedSet.has(p.id),
      })),
      nextCursor: items.length === take ? items[items.length - 1]?.id : null,
    };
  }

  async createPost(params: {
    tenantId: string;
    userId: string;
    spaceId: string;
    title: string;
    body: string;
    attachmentFileId?: string;
  }) {
    const space = await this.prisma.communitySpace.findFirst({
      where: { tenantId: params.tenantId, id: params.spaceId, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!space) throw new NotFoundException();

    await this.ensureMember(params.tenantId, params.spaceId, params.userId);
    if (params.attachmentFileId) await this.assertAttachment(params.tenantId, params.attachmentFileId);

    const post = await this.prisma.communityPost.create({
      data: {
        tenantId: params.tenantId,
        spaceId: params.spaceId,
        authorId: params.userId,
        title: params.title,
        body: params.body,
        status: 'PUBLISHED',
        attachmentFileId: params.attachmentFileId ?? null,
      },
      select: { id: true },
    });

    await this.prisma.analyticsEvent.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        name: 'community.post_created',
        properties: { postId: post.id, spaceId: params.spaceId, hasAttachment: Boolean(params.attachmentFileId) } as never,
      },
      select: { id: true },
    });

    return this.getPost({ tenantId: params.tenantId, userId: params.userId, postId: post.id });
  }

  async addComment(params: {
    tenantId: string;
    userId: string;
    postId: string;
    body: string;
    parentCommentId?: string;
    attachmentFileId?: string;
  }) {
    const post = await this.prisma.communityPost.findFirst({
      where: { tenantId: params.tenantId, id: params.postId },
      select: { id: true, spaceId: true, authorId: true, status: true },
    });
    if (!post) throw new NotFoundException();
    if (post.status !== 'PUBLISHED') throw new ForbiddenException();

    if (params.parentCommentId) {
      const parent = await this.prisma.communityComment.findFirst({
        where: { tenantId: params.tenantId, id: params.parentCommentId, postId: params.postId, status: 'PUBLISHED' },
        select: { id: true, authorId: true },
      });
      if (!parent) throw new BadRequestException('invalid_parent');
    }

    await this.ensureMember(params.tenantId, post.spaceId, params.userId);
    if (params.attachmentFileId) await this.assertAttachment(params.tenantId, params.attachmentFileId);

    const created = await this.prisma.communityComment.create({
      data: {
        tenantId: params.tenantId,
        postId: params.postId,
        authorId: params.userId,
        body: params.body,
        status: 'PUBLISHED',
        parentCommentId: params.parentCommentId ?? null,
        attachmentFileId: params.attachmentFileId ?? null,
      },
      select: { id: true, authorId: true, parentCommentId: true },
    });

    await this.prisma.analyticsEvent.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        name: 'community.comment_created',
        properties: {
          postId: params.postId,
          commentId: created.id,
          parentCommentId: created.parentCommentId ?? null,
          hasAttachment: Boolean(params.attachmentFileId),
        } as never,
      },
      select: { id: true },
    });

    const notifyUserIds = new Set<string>();
    if (post.authorId !== params.userId) notifyUserIds.add(post.authorId);
    if (created.parentCommentId) {
      const parent = await this.prisma.communityComment.findFirst({
        where: { tenantId: params.tenantId, id: created.parentCommentId },
        select: { authorId: true },
      });
      if (parent?.authorId && parent.authorId !== params.userId) notifyUserIds.add(parent.authorId);
    }

    if (notifyUserIds.size) {
      await this.prisma.notification.createMany({
        data: Array.from(notifyUserIds).map((userId) => ({
          tenantId: params.tenantId,
          userId,
          type: 'community.comment.created',
          title: 'Nova resposta na comunidade',
          body: 'Você recebeu uma nova resposta em um post.',
          payload: { postId: params.postId, commentId: created.id },
          status: 'PENDING',
          channel: 'IN_APP',
        })),
      });

      await this.prisma.outboxEvent.createMany({
        data: Array.from(notifyUserIds).map((recipientUserId) => ({
          tenantId: params.tenantId,
          topic: 'community.comment.created',
          payload: { recipientUserId, postId: params.postId, commentId: created.id, actorUserId: params.userId },
          dedupeKey: `community.comment.created:${created.id}:${recipientUserId}`,
        })),
      });
    }

    return { ok: true, id: created.id };
  }

  async reactToPost(params: { tenantId: string; userId: string; postId: string; kind: string }) {
    const post = await this.prisma.communityPost.findFirst({
      where: { tenantId: params.tenantId, id: params.postId, status: 'PUBLISHED' },
      select: { id: true, authorId: true },
    });
    if (!post) throw new NotFoundException();

    const existing = await this.prisma.reaction.findFirst({
      where: { tenantId: params.tenantId, userId: params.userId, postId: params.postId, kind: params.kind as never },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.reaction.delete({ where: { id: existing.id } });
      return { reacted: false };
    }

    await this.prisma.reaction.create({
      data: { tenantId: params.tenantId, userId: params.userId, postId: params.postId, kind: params.kind as never },
      select: { id: true },
    });

    if (params.kind === 'LIKE') {
      await this.prisma.analyticsEvent.create({
        data: { tenantId: params.tenantId, userId: params.userId, name: 'community.post_liked', properties: { postId: params.postId } as never },
        select: { id: true },
      });
    }

    if (post.authorId !== params.userId && params.kind === 'LIKE') {
      await this.prisma.notification.create({
        data: {
          tenantId: params.tenantId,
          userId: post.authorId,
          type: 'community.post.liked',
          title: 'Curtiram seu post',
          body: 'Seu post recebeu uma curtida.',
          payload: { postId: params.postId },
          channel: 'IN_APP',
          status: 'PENDING',
        },
        select: { id: true },
      });
    }

    return { reacted: true };
  }

  async reactToComment(params: { tenantId: string; userId: string; commentId: string; kind: string }) {
    const comment = await this.prisma.communityComment.findFirst({
      where: { tenantId: params.tenantId, id: params.commentId, status: 'PUBLISHED' },
      select: { id: true, authorId: true, postId: true },
    });
    if (!comment) throw new NotFoundException();

    const existing = await this.prisma.reaction.findFirst({
      where: { tenantId: params.tenantId, userId: params.userId, commentId: params.commentId, kind: params.kind as never },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.reaction.delete({ where: { id: existing.id } });
      return { reacted: false };
    }

    await this.prisma.reaction.create({
      data: { tenantId: params.tenantId, userId: params.userId, commentId: params.commentId, kind: params.kind as never },
      select: { id: true },
    });

    if (params.kind === 'LIKE') {
      await this.prisma.analyticsEvent.create({
        data: { tenantId: params.tenantId, userId: params.userId, name: 'community.comment_liked', properties: { commentId: params.commentId } as never },
        select: { id: true },
      });
    }

    if (comment.authorId !== params.userId && params.kind === 'LIKE') {
      await this.prisma.notification.create({
        data: {
          tenantId: params.tenantId,
          userId: comment.authorId,
          type: 'community.comment.liked',
          title: 'Curtiram seu comentário',
          body: 'Seu comentário recebeu uma curtida.',
          payload: { postId: comment.postId, commentId: params.commentId },
          channel: 'IN_APP',
          status: 'PENDING',
        },
        select: { id: true },
      });
    }

    return { reacted: true };
  }

  async reportPost(params: { tenantId: string; userId: string; postId: string; reason: string; details?: string }) {
    const post = await this.prisma.communityPost.findFirst({
      where: { tenantId: params.tenantId, id: params.postId },
      select: { id: true, status: true },
    });
    if (!post) throw new NotFoundException();
    if (post.status === 'DELETED') throw new NotFoundException();

    await this.prisma.communityReport.create({
      data: { tenantId: params.tenantId, reporterId: params.userId, postId: params.postId, reason: params.reason, details: params.details ?? null },
      select: { id: true },
    });

    await this.prisma.analyticsEvent.create({
      data: { tenantId: params.tenantId, userId: params.userId, name: 'community.post_reported', properties: { postId: params.postId, reason: params.reason } as never },
      select: { id: true },
    });

    const openReports = await this.prisma.communityReport.count({
      where: { tenantId: params.tenantId, postId: params.postId, resolvedAt: null },
    });
    if (openReports >= 3) {
      await this.prisma.communityPost.update({
        where: { id: params.postId },
        data: { status: 'UNDER_REVIEW' },
        select: { id: true },
      });
    }

    return { ok: true };
  }

  async reportComment(params: { tenantId: string; userId: string; commentId: string; reason: string; details?: string }) {
    const comment = await this.prisma.communityComment.findFirst({
      where: { tenantId: params.tenantId, id: params.commentId },
      select: { id: true, status: true },
    });
    if (!comment) throw new NotFoundException();
    if (comment.status === 'DELETED') throw new NotFoundException();

    await this.prisma.communityReport.create({
      data: { tenantId: params.tenantId, reporterId: params.userId, commentId: params.commentId, reason: params.reason, details: params.details ?? null },
      select: { id: true },
    });

    await this.prisma.analyticsEvent.create({
      data: { tenantId: params.tenantId, userId: params.userId, name: 'community.comment_reported', properties: { commentId: params.commentId, reason: params.reason } as never },
      select: { id: true },
    });

    const openReports = await this.prisma.communityReport.count({
      where: { tenantId: params.tenantId, commentId: params.commentId, resolvedAt: null },
    });
    if (openReports >= 3) {
      await this.prisma.communityComment.update({
        where: { id: params.commentId },
        data: { status: 'UNDER_REVIEW' },
        select: { id: true },
      });
    }

    return { ok: true };
  }

  async moderatePost(params: { tenantId: string; userId: string; postId: string; action: string; reason?: string }) {
    const post = await this.prisma.communityPost.findFirst({
      where: { tenantId: params.tenantId, id: params.postId },
      select: { id: true, spaceId: true, authorId: true, status: true },
    });
    if (!post) throw new NotFoundException();

    const action = params.action.toLowerCase();
    const isAuthor = post.authorId === params.userId;
    const memberRole = await this.getMemberRole(params.tenantId, post.spaceId, params.userId);
    const canModerate =
      (await this.isTenantAdmin(params.tenantId, params.userId)) || memberRole === 'ADMIN' || memberRole === 'MODERATOR';
    if (!isAuthor && !canModerate) throw new ForbiddenException();

    if (['hide', 'unhide', 'delete', 'pin', 'unpin'].includes(action)) {
      await this.assertCanModerateSpace(params.tenantId, post.spaceId, params.userId);
    }

    let data: any = {};
    if (action === 'hide') data = { status: 'HIDDEN' };
    else if (action === 'unhide') data = { status: 'PUBLISHED' };
    else if (action === 'archive') data = { status: 'ARCHIVED' };
    else if (action === 'unarchive') data = { status: 'PUBLISHED' };
    else if (action === 'delete') data = { status: 'DELETED' };
    else if (action === 'pin') data = { pinnedAt: new Date() };
    else if (action === 'unpin') data = { pinnedAt: null };
    else throw new BadRequestException('invalid_action');

    const updated = await this.prisma.communityPost.update({
      where: { id: post.id },
      data,
      select: { id: true, status: true, pinnedAt: true, updatedAt: true },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.userId,
        targetUserId: post.authorId,
        action: `community.post.${action}`,
        targetType: 'CommunityPost',
        targetId: post.id,
        metadata: { reason: params.reason ?? null },
      },
      select: { id: true },
    });

    await this.prisma.analyticsEvent.create({
      data: { tenantId: params.tenantId, userId: params.userId, name: 'community.post_moderated', properties: { postId: post.id, action } as never },
      select: { id: true },
    });

    return updated;
  }

  async moderateComment(params: { tenantId: string; userId: string; commentId: string; action: string; reason?: string }) {
    const comment = await this.prisma.communityComment.findFirst({
      where: { tenantId: params.tenantId, id: params.commentId },
      select: { id: true, postId: true, authorId: true, status: true, post: { select: { spaceId: true } } },
    });
    if (!comment) throw new NotFoundException();

    const action = params.action.toLowerCase();
    const isAuthor = comment.authorId === params.userId;

    if (['hide', 'unhide'].includes(action)) {
      await this.assertCanModerateSpace(params.tenantId, comment.post.spaceId, params.userId);
    } else if (action === 'delete') {
      if (!isAuthor) await this.assertCanModerateSpace(params.tenantId, comment.post.spaceId, params.userId);
    } else {
      throw new BadRequestException('invalid_action');
    }

    const status = action === 'hide' ? 'HIDDEN' : action === 'unhide' ? 'PUBLISHED' : 'DELETED';

    const updated = await this.prisma.communityComment.update({
      where: { id: comment.id },
      data: { status: status as never },
      select: { id: true, status: true, updatedAt: true },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.userId,
        targetUserId: comment.authorId,
        action: `community.comment.${action}`,
        targetType: 'CommunityComment',
        targetId: comment.id,
        metadata: { reason: params.reason ?? null },
      },
      select: { id: true },
    });

    await this.prisma.analyticsEvent.create({
      data: { tenantId: params.tenantId, userId: params.userId, name: 'community.comment_moderated', properties: { commentId: comment.id, action } as never },
      select: { id: true },
    });

    return updated;
  }
}
