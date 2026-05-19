export type CategorySeedAttribute = {
  name: string;
  options: string[];
};

export type CategorySeedNode = {
  name: string;
  rank: number;
  imageFilename?: string;
  attributes?: CategorySeedAttribute[];
  children?: CategorySeedNode[];
};

const attributesFashionCommon: CategorySeedAttribute[] = [
  { name: 'Material', options: ['Cotton', 'Linen'] },
  { name: 'Style', options: ['Sport', 'Minimal', 'Retro', 'Classic'] },
];

const attributesAccessoriesBagCommon: CategorySeedAttribute[] = [
  { name: 'Material', options: ['Canvas', 'Nylon', 'PVC', 'Skin'] },
  { name: 'Lock Bag', options: ['Zip lock', 'Press lock'] },
];

const attributesAccessoriesHatCommon: CategorySeedAttribute[] = [
  { name: 'Gender', options: ['Male', 'Female', 'Unisex'] },
  { name: 'Material', options: ['Canvas', 'Nylon', 'PVC', 'Skin'] },
];

const attributesArtCommon: CategorySeedAttribute[] = [
  { name: 'Material', options: ['Wood', 'Plastic', 'Metal'] },
];

const attributesElectronicsCommon: CategorySeedAttribute[] = [
  {
    name: 'Warranty period',
    options: [
      '1 month',
      '2 months',
      '3 months',
      '6 months',
      '12 months',
      '24 months',
      '3 years',
      '5 years',
    ],
  },
  {
    name: 'Warranty type',
    options: [
      'International warranty',
      'Manufacturer warranty',
      'Supplier warranty',
      'No warranty',
    ],
  },
];

export const categorySeedData: CategorySeedNode[] = [
  {
    name: 'Fashion',
    rank: 1,
    imageFilename: 'categories/fashion.jpg',
    children: [
      {
        name: 'Man Fashion',
        rank: 1,
        imageFilename: 'categories/man-fasion.jpg',
        children: [
          {
            name: 'Sweaters',
            rank: 1,
            attributes: attributesFashionCommon,
          },
          {
            name: 'Tees',
            rank: 2,
            attributes: attributesFashionCommon,
          },
          {
            name: 'Hoodies',
            rank: 3,
            attributes: attributesFashionCommon,
          },
          {
            name: 'Pants',
            rank: 4,
            attributes: attributesFashionCommon,
          },
        ],
      },
      {
        name: "Women's Fashion",
        rank: 2,
        imageFilename: 'categories/women-fasion.jpg',
        children: [
          {
            name: 'Sweaters',
            rank: 1,
            attributes: attributesFashionCommon,
          },
          {
            name: 'Dresses',
            rank: 2,
            attributes: attributesFashionCommon,
          },
          {
            name: 'Tees',
            rank: 3,
            children: [
              {
                name: 'T-shirts',
                rank: 1,
                children: [
                  {
                    name: 'Graphic Tee',
                    rank: 1,
                    attributes: attributesFashionCommon,
                  },
                ],
              },
              {
                name: 'Polos',
                rank: 2,
                attributes: attributesFashionCommon,
              },
            ],
          },
          {
            name: 'Skirts',
            rank: 4,
            attributes: attributesFashionCommon,
          },
        ],
      },
      {
        name: 'Accessories',
        rank: 3,
        imageFilename: 'categories/accessories.jpeg',
        children: [
          {
            name: 'Hat & Cap',
            rank: 1,
            imageFilename: 'categories/hat.webp',
            attributes: attributesAccessoriesHatCommon,
          },
        ],
      },
      {
        name: 'Shoes',
        rank: 4,
        imageFilename: 'categories/shoes.jpeg',
        children: [
          {
            name: 'Sneakers',
            rank: 1,
            attributes: attributesFashionCommon,
          },
          {
            name: 'Boots',
            rank: 2,
            attributes: attributesFashionCommon,
          },
        ],
      },
      {
        name: 'Bags & Purses',
        rank: 5,
        imageFilename: 'categories/bags-purses.png',
        children: [
          {
            name: 'Totes',
            rank: 1,
            imageFilename: 'categories/totes.png',
            attributes: attributesAccessoriesBagCommon,
          },
          {
            name: 'Handbags',
            rank: 2,
            imageFilename: 'categories/handbags.png',
            attributes: attributesAccessoriesBagCommon,
          },
          {
            name: 'Wallets',
            rank: 3,
            imageFilename: 'categories/wallets.png',
            attributes: attributesAccessoriesBagCommon,
          },
        ],
      },
    ],
  },
  {
    name: 'Electronics',
    rank: 3,
    imageFilename: 'categories/electronics.jpg',
    children: [
      {
        name: 'Camera',
        rank: 1,
        imageFilename: 'categories/camera.webp',
        attributes: attributesElectronicsCommon,
      },
      {
        name: 'Ebook Readers',
        rank: 2,
        imageFilename: 'categories/ebook-reader.webp',
        attributes: attributesElectronicsCommon,
      },
      {
        name: 'Headphones',
        rank: 3,
        imageFilename: 'categories/headphone.jpg',
        attributes: attributesElectronicsCommon,
      },
    ],
  },
  {
    name: 'Art',
    rank: 3,
    imageFilename: 'categories/art.jpg',
    children: [
      {
        name: 'Crafting',
        rank: 1,
        imageFilename: 'categories/crafting.webp',
        attributes: attributesArtCommon,
      },
      {
        name: 'Painting',
        rank: 2,
        imageFilename: 'categories/painting.webp',
        attributes: attributesArtCommon,
      },
    ],
  },
  {
    name: 'Home & Living',
    rank: 4,
    imageFilename: 'categories/home-living.jpg',
    children: [
      {
        name: 'Furniture',
        rank: 1,
        imageFilename: 'categories/furniture.webp',
        children: [
          {
            name: 'Table',
            rank: 1,
            imageFilename: 'categories/table.jpg',
            attributes: [
              {
                name: 'Material',
                options: ['Wood', 'Skin', 'Plastic'],
              },
            ],
          },
        ],
      },
      {
        name: 'Bathroom',
        rank: 2,
        imageFilename: 'categories/bathroom.jpg',
        children: [
          {
            name: 'Towel',
            rank: 1,
            imageFilename: 'categories/towel.jpg',
          },
        ],
      },
    ],
  },
  {
    name: 'Toys & Games',
    rank: 5,
    imageFilename: 'categories/toy-video-games.webp',
    children: [
      {
        name: 'Games',
        rank: 1,
        imageFilename: 'categories/toy-video-games.webp',
        children: [
          {
            name: 'Videos game',
            rank: 1,
            children: [
              { name: 'Xbox games', rank: 1 },
              { name: 'Playstation games', rank: 2 },
            ],
          },
          {
            name: 'Console game',
            rank: 2,
            children: [
              { name: 'Xbox', rank: 1 },
              { name: 'Playstation', rank: 2 },
            ],
          },
          {
            name: 'Accessories console',
            rank: 3,
            attributes: [
              {
                name: 'Type accessory',
                options: ['Cable', 'Gamepad', 'Controller'],
              },
            ],
          },
        ],
      },
      {
        name: 'Puppets',
        rank: 2,
        imageFilename: 'categories/puppets.webp',
        attributes: [
          { name: 'Material', options: ['Paper', 'Plastic', 'Wood'] },
        ],
      },
    ],
  },
];
