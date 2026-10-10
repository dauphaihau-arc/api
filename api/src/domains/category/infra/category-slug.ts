export function normalizeCategorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/[\s_-]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'category';
}
