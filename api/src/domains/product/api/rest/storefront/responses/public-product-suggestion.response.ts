export type PublicProductSuggestionResponse = {
  id: string;
  title: string;
  slug: string;
  shop: {
    id: string;
    public_id?: string;
    shop_name: string;
    slug: string;
  };
};
