import { AuditAction, type Prisma, type SubCategory } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../../config/prisma';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { writeAudit } from '../../utils/audit';
import { buildPaginationMeta, type PaginationMeta } from '../../utils/pagination';
import type {
  CreateSubCategoryInput,
  ListSubCategoriesQuery,
  UpdateSubCategoryInput,
} from './subcategories.schema';

export interface ListSubCategoriesResult {
  items: SubCategory[];
  pagination: PaginationMeta;
}

export async function listSubCategories(query: ListSubCategoriesQuery): Promise<ListSubCategoriesResult> {
  const { page, pageSize, search, categoryId, isActive } = query;

  const where: Prisma.SubCategoryWhereInput = {
    deletedAt: null,
    ...(categoryId ? { categoryId } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.subCategory.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.subCategory.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(page, pageSize, total) };
}

export async function getSubCategoryById(id: string): Promise<SubCategory> {
  const subCategory = await prisma.subCategory.findFirst({ where: { id, deletedAt: null } });
  if (!subCategory) throw notFound('That sub-category does not exist.');
  return subCategory;
}

/** Also used by the product module to validate a product's subCategoryId. */
export async function findActiveSubCategoryOrThrow(id: string): Promise<SubCategory> {
  const subCategory = await prisma.subCategory.findFirst({ where: { id, deletedAt: null } });
  if (!subCategory) throw notFound('That sub-category does not exist.');
  return subCategory;
}

async function assertParentCategoryUsable(categoryId: string): Promise<void> {
  const category = await prisma.category.findFirst({ where: { id: categoryId, deletedAt: null } });
  if (!category) throw notFound('That category does not exist.');
  if (!category.isActive) throw badRequest('Cannot add a sub-category under an inactive category.');
}

export async function createSubCategory(
  input: CreateSubCategoryInput,
  actor: { id: string },
  req: Request,
): Promise<SubCategory> {
  await assertParentCategoryUsable(input.categoryId);

  const existing = await prisma.subCategory.findFirst({
    where: { categoryId: input.categoryId, name: input.name, deletedAt: null },
  });
  if (existing) throw conflict('A sub-category with that name already exists under this category.');

  const subCategory = await prisma.subCategory.create({
    data: { name: input.name, categoryId: input.categoryId },
  });

  await writeAudit({
    userId: actor.id,
    action: AuditAction.CREATE,
    entity: 'SubCategory',
    entityId: subCategory.id,
    after: subCategory,
    req,
  });

  return subCategory;
}

export async function updateSubCategory(
  id: string,
  input: UpdateSubCategoryInput,
  actor: { id: string },
  req: Request,
): Promise<SubCategory> {
  const before = await getSubCategoryById(id);
  const targetCategoryId = input.categoryId ?? before.categoryId;

  if (input.categoryId) await assertParentCategoryUsable(input.categoryId);

  if (input.name) {
    const existing = await prisma.subCategory.findFirst({
      where: { id: { not: id }, categoryId: targetCategoryId, name: input.name, deletedAt: null },
    });
    if (existing) throw conflict('A sub-category with that name already exists under this category.');
  }

  const subCategory = await prisma.subCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await writeAudit({
    userId: actor.id,
    action: AuditAction.UPDATE,
    entity: 'SubCategory',
    entityId: subCategory.id,
    before,
    after: subCategory,
    req,
  });

  return subCategory;
}

export async function deleteSubCategory(id: string, actor: { id: string }, req: Request): Promise<void> {
  const before = await getSubCategoryById(id);

  const subCategory = await prisma.subCategory.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
  });

  await writeAudit({
    userId: actor.id,
    action: AuditAction.DELETE,
    entity: 'SubCategory',
    entityId: subCategory.id,
    before,
    after: subCategory,
    req,
  });
}
