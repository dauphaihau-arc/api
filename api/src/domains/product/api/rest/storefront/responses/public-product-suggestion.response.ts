export type PublicProductSuggestionResponse = {
  id: string;
  title: string;
  slug: string;
  shop: {
    id: string;
    shop_name: string;
    slug: string;
  };
};
