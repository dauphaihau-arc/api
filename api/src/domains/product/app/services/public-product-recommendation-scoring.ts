export interface RecommendationScorableProduct {
  id: string;
  categoryId?: string;
  whoMade?: string;
  isDigital?: boolean;
  variantType?: string;
  attributeOptionKeys: string[];
  inferredFacetKeys: string[];
  minPriceAmountMinor?: number;
  inStock: boolean;
  stockTotal: number;
  popularityScore: number;
  createdAt: Date;
}

export function scoreRecommendation(
  anchor: RecommendationScorableProduct,
  candidate: RecommendationScorableProduct,
): number {
  let score = 0;

  if (anchor.categoryId && candidate.categoryId && anchor.categoryId === candidate.categoryId) {
    score += 60;
  }

  if (anchor.whoMade && candidate.whoMade && anchor.whoMade === candidate.whoMade) {
    score += 10;
  }

  if (anchor.isDigital === candidate.isDigital) {
    score += 6;
  }

  if (anchor.variantType && candidate.variantType && anchor.variantType === candidate.variantType) {
    score += 6;
  }

  const attributeMatches = countSharedTerms(
    anchor.attributeOptionKeys,
    candidate.attributeOptionKeys,
  );
  score += Math.min(attributeMatches, 4) * 12;

  const inferredFacetMatches = countSharedTerms(
    anchor.inferredFacetKeys,
    candidate.inferredFacetKeys,
  );
  score += Math.min(inferredFacetMatches, 3) * 8;

  const priceSimilarity = getPriceSimilarityScore(
    anchor.minPriceAmountMinor,
    candidate.minPriceAmountMinor,
  );
  score += priceSimilarity;

  if (candidate.inStock) {
    score += 8;
  }

  if (candidate.stockTotal > 0) {
    score += Math.min(candidate.stockTotal, 20) / 4;
  }

  score += Math.min(candidate.popularityScore, 200) / 20;

  return score;
}

export function compareRecommendationCandidates(
  anchor: RecommendationScorableProduct,
  left: RecommendationScorableProduct,
  right: RecommendationScorableProduct,
): number {
  const leftScore = scoreRecommendation(anchor, left);
  const rightScore = scoreRecommendation(anchor, right);

  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  if (left.inStock !== right.inStock) {
    return Number(right.inStock) - Number(left.inStock);
  }

  if (left.popularityScore !== right.popularityScore) {
    return right.popularityScore - left.popularityScore;
  }

  return right.createdAt.getTime() - left.createdAt.getTime();
}

function countSharedTerms(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightTerms = new Set(right);

  return left.reduce((count, term) => count + (rightTerms.has(term) ? 1 : 0), 0);
}

function getPriceSimilarityScore(
  anchorAmount?: number,
  candidateAmount?: number,
): number {
  if (anchorAmount == null || candidateAmount == null || anchorAmount <= 0 || candidateAmount <= 0) {
    return 0;
  }

  const larger = Math.max(anchorAmount, candidateAmount);
  const smaller = Math.min(anchorAmount, candidateAmount);
  const ratio = smaller / larger;

  if (ratio >= 0.9) return 16;
  if (ratio >= 0.75) return 10;
  if (ratio >= 0.5) return 4;
  return -6;
}
