// Shared Square catalog identity resolver. Does not decide historical eligibility.
export type SquareCatalogIdentity = {
  type?: string;
  id?: string;
  item_variation_data?: { item_id?: string };
};
export function resolveSquareProduct(
  catalogId: string | null,
  catalog: SquareCatalogIdentity | undefined,
  products: ReadonlyMap<string, string>,
) {
  const squareVariationId = catalog?.type === "ITEM_VARIATION" ? catalog.id ?? catalogId : null;
  const squareItemId = catalog?.type === "ITEM_VARIATION"
    ? catalog.item_variation_data?.item_id ?? null
    : catalog?.type === "ITEM" ? catalog.id ?? catalogId : null;
  const matched = [...new Set([squareVariationId, squareItemId, catalogId]
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .map(id => products.get(id))
    .filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (matched.length > 1) throw new Error("Conflicting Square-to-CNS product mapping");
  return { squareItemId, squareVariationId, productId: matched[0] ?? null };
}
