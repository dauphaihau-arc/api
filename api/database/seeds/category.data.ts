export type CategorySeedAttribute = {
  name: string;
  options: string[];
};

export type CategorySeedNode = {
  name: string;
  rank: number;
  imageStorageKey?: string;
  attributes?: CategorySeedAttribute[];
  children?: CategorySeedNode[];
};

const attributesClothingCommon: CategorySeedAttribute[] = [
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
    name: 'Clothing',
    rank: 1,
    imageStorageKey: 'categories/clothing.jpg',
    children: [
      {
        name: 'Man Fashion',
        rank: 1,
        imageStorageKey: 'categories/man-fasion.jpg',
        children: [
          {
            name: 'Sweaters',
            rank: 1,
            attributes: attributesClothingCommon,
          },
          {
            name: 'Tees',
            rank: 2,
            attributes: attributesClothingCommon,
          },
          {
            name: 'Hoodies',
            rank: 3,
            attributes: attributesClothingCommon,
          },
        ],
      },
      {
        name: "Women's Fashion",
        rank: 2,
        imageStorageKey: 'categories/women-fasion.jpg',
        children: [
          {
            name: 'Sweaters',
            rank: 1,
            attributes: attributesClothingCommon,
          },
          {
            name: 'Dresses',
            rank: 2,
            attributes: attributesClothingCommon,
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
                    attributes: attributesClothingCommon,
                  },
                ],
              },
              {
                name: 'Polos',
                rank: 2,
                attributes: attributesClothingCommon,
              },
            ],
          },
          {
            name: 'Skirts',
            rank: 4,
            attributes: attributesClothingCommon,
          },
        ],
      },
    ],
  },
  {
    name: 'Accessories',
    rank: 2,
    imageStorageKey: 'categories/accessories.jpeg',
    children: [
      {
        name: 'Hat & Cap',
        rank: 1,
        imageStorageKey: 'categories/hat.webp',
        attributes: attributesAccessoriesHatCommon,
      },
      {
        name: 'Bag',
        rank: 2,
        imageStorageKey: 'categories/bag.webp',
        children: [
          {
            name: 'Totes',
            rank: 1,
            attributes: attributesAccessoriesBagCommon,
          },
          {
            name: 'Wallet',
            rank: 2,
            attributes: attributesAccessoriesBagCommon,
          },
        ],
      },
    ],
  },
  {
    name: 'Electronics',
    rank: 3,
    imageStorageKey: 'categories/electronics.jpg',
    children: [
      {
        name: 'Camera',
        rank: 1,
        imageStorageKey: 'categories/camera.webp',
        attributes: attributesElectronicsCommon,
      },
      {
        name: 'Ebook Readers',
        rank: 2,
        imageStorageKey: 'categories/ebook-reader.webp',
        attributes: attributesElectronicsCommon,
      },
      {
        name: 'Headphones',
        rank: 3,
        imageStorageKey: 'categories/headphone.jpg',
        attributes: attributesElectronicsCommon,
      },
    ],
  },
  {
    name: 'Art',
    rank: 4,
    imageStorageKey: 'categories/art.jpg',
    children: [
      {
        name: 'Crafting',
        rank: 1,
        imageStorageKey: 'categories/crafting.webp',
        attributes: attributesArtCommon,
      },
      {
        name: 'Painting',
        rank: 2,
        imageStorageKey: 'categories/painting.webp',
        attributes: attributesArtCommon,
      },
    ],
  },
  {
    name: 'Home',
    rank: 5,
    imageStorageKey: 'categories/home.jpg',
    children: [
      {
        name: 'Furniture',
        rank: 1,
        imageStorageKey: 'categories/furniture.webp',
        children: [
          {
            name: 'Table',
            rank: 1,
            imageStorageKey: 'categories/table.jpg',
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
        imageStorageKey: 'categories/bathroom.jpg',
        children: [
          {
            name: 'Towel',
            rank: 1,
            imageStorageKey: 'categories/towel.jpg',
          },
        ],
      },
    ],
  },
  {
    name: 'Toys & Games',
    rank: 6,
    imageStorageKey: 'categories/toy-video-games.webp',
    children: [
      {
        name: 'Games',
        rank: 1,
        imageStorageKey: 'categories/toy-video-games.webp',
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
        imageStorageKey: 'categories/puppets.webp',
        attributes: [
          { name: 'Material', options: ['Paper', 'Plastic', 'Wood'] },
        ],
      },
    ],
  },
];
