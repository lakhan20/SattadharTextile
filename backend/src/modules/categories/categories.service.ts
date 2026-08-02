import { AuditAction, type Category, type Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../../config/prisma';
import { conflict, notFound } from '../../utils/errors';
import { writeAudit } from '../../utils/audit';
import { buildPaginationMeta, type PaginationMeta } from '../../utils/pagination';
import type { CreateCategoryInput, ListCategoriesQuery, UpdateCategoryInput } from './categories.schema';

export interface ListCategoriesResult {
  items: Category[];
  pagination: PaginationMeta;
}

export async function listCategories(query: ListCategoriesQuery): Promise<ListCategoriesResult> {
  const { page, pageSize, search, isActive } = query;

  const where: Prisma.CategoryWhereInput = {
    deletedAt: null,
    ...(isActive !== undefined ? { isActive } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.category.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(page, pageSize, total) };
}

export async function getCategoryById(id: string): Promise<Category> {
  const category = await prisma.category.findFirst({ where: { id, deletedAt: null } });
  if (!category) throw notFound('That category does not exist.');
  return category;
}

/** Used by the sub-category and product modules to validate the parent FK. */
export async function findActiveCategoryOrThrow(id: string): Promise<Category> {
  const category = await prisma.category.findFirst({ where: { id, deletedAt: null } });
  if (!category) throw notFound('That category does not exist.');
  return category;
}

export async function createCategory(
  input: CreateCategoryInput,
  actor: { id: string },
  req: Request,
): Promise<Category> {
  const existing = await prisma.category.findFirst({
    where: { deletedAt: null, OR: [{ name: input.name }, { code: input.code }] },
  });
  if (existing) throw conflict('A category with that name or code already exists.');

  const category = await prisma.category.create({
    data: {
      name: input.name,
      code: input.code,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
    },
  });

  await writeAudit({
    userId: actor.id,
    action: AuditAction.CREATE,
    entity: 'Category',
    entityId: category.id,
    after: category,
    req,
  });

  return category;
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
  actor: { id: string },
  req: Request,
): Promise<Category> {
  const before = await getCategoryById(id);

  if (input.name || input.code) {
    const existing = await prisma.category.findFirst({
      where: {
        deletedAt: null,
        id: { not: id },
        OR: [...(input.name ? [{ name: input.name }] : []), ...(input.code ? [{ code: input.code }] : [])],
      },
    });
    if (existing) throw conflict('A category with that name or code already exists.');
  }

  const category = await prisma.category.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await writeAudit({
    userId: actor.id,
    action: AuditAction.UPDATE,
    entity: 'Category',
    entityId: category.id,
    before,
    after: category,
    req,
  });

  return category;
}

export async function deleteCategory(id: string, actor: { id: string }, req: Request): Promise<void> {
  const before = await getCategoryById(id);

  const category = await prisma.category.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
  });

  await writeAudit({
    userId: actor.id,
    action: AuditAction.DELETE,
    entity: 'Category',
    entityId: category.id,
    before,
    after: category,
    req,
  });
}
