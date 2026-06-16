export type PublicProductFacetResponse = {
  facets: Array<{
    facet_key: string;
    attribute_name: string;
    options: Array<{
      option_key: string;
      value: string;
    }>;
  }>;
};
