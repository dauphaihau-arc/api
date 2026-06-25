export type CategorySeedAttribute = {
  key: string;
  name: string;
  options: string[];
};

export type CategorySeedNode = {
  name: string;
  rank: number;
  imageFilename?: string;
  featuredFacetKeys?: string[];
  attributes?: CategorySeedAttribute[];
  children?: CategorySeedNode[];
};

const attributeFashionColor: CategorySeedAttribute = {
  key: 'color',
  name: 'Color',
  options: ['Black', 'White', 'Blue', 'Beige', 'Green'],
};

const attributeFashionGender: CategorySeedAttribute = {
  key: 'gender',
  name: 'Gender',
  options: ['Male', 'Female', 'Unisex'],
};

const attributesFashionCommon: CategorySeedAttribute[] = [
  { key: 'material', name: 'Material', options: ['Cotton', 'Linen'] },
  { key: 'style', name: 'Style', options: ['Sport', 'Minimal', 'Retro', 'Classic'] },
  attributeFashionColor,
  { key: 'apparel_size', name: 'Size', options: ['XS', 'S', 'M', 'L', 'XL'] },
  { key: 'occasion', name: 'Occasion', options: ['Casual', 'Work', 'Party', 'Outdoor'] },
  attributeFashionGender,
];

const attributesShoesCommon: CategorySeedAttribute[] = [
  { key: 'material', name: 'Material', options: ['Leather', 'Suede', 'Mesh', 'Canvas', 'Rubber'] },
  { key: 'style', name: 'Style', options: ['Running', 'Casual', 'Retro', 'Minimal'] },
  attributeFashionColor,
  {
    key: 'shoe_size',
    name: 'Size',
    options: [
      'US 6',
      'US 6.5',
      'US 7',
      'US 8',
      'US 9',
      'US 10',
      'US 11',
      'EU 38.5',
      'EU 39',
      'EU 40',
      'EU 41',
      'EU 42',
      'EU 43',
      'EU 44',
    ],
  },
  { key: 'occasion', name: 'Occasion', options: ['Daily', 'Sport', 'Outdoor', 'Streetwear'] },
  attributeFashionGender,
];

const attributesAccessoriesBagCommon: CategorySeedAttribute[] = [
  { key: 'material', name: 'Material', options: ['Canvas', 'Nylon', 'PVC', 'Skin'] },
  { key: 'bag_lock', name: 'Lock Bag', options: ['Zip lock', 'Press lock'] },
  { key: 'color', name: 'Color', options: ['Black', 'Brown', 'Cream', 'Pink', 'Green'] },
  {
    key: 'bag_size',
    name: 'Bag size',
    options: ['Mini', 'Small', 'Medium', 'Large'],
  },
  {
    key: 'occasion',
    name: 'Occasion',
    options: ['Daily use', 'Office', 'Travel', 'Party'],
  },
];

const attributesAccessoriesHatCommon: CategorySeedAttribute[] = [
  { key: 'gender', name: 'Gender', options: ['Male', 'Female', 'Unisex'] },
  { key: 'material', name: 'Material', options: ['Canvas', 'Nylon', 'PVC', 'Skin'] },
  { key: 'color', name: 'Color', options: ['Black', 'White', 'Brown', 'Blue'] },
  { key: 'hat_size', name: 'Size', options: ['S', 'M', 'L'] },
  { key: 'style', name: 'Style', options: ['Baseball cap', 'Bucket hat', 'Beanie', 'Beret'] },
];

const attributesArtCommon: CategorySeedAttribute[] = [
  { key: 'material', name: 'Material', options: ['Wood', 'Plastic', 'Metal'] },
  { key: 'theme', name: 'Theme', options: ['Nature', 'Abstract', 'Religious', 'Vintage'] },
  { key: 'color_palette', name: 'Color palette', options: ['Warm', 'Neutral', 'Pastel', 'Bold'] },
];

const attributesElectronicsCommon: CategorySeedAttribute[] = [
  {
    key: 'warranty_period',
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
    key: 'warranty_type',
    name: 'Warranty type',
    options: [
      'International warranty',
      'Manufacturer warranty',
      'Supplier warranty',
      'No warranty',
    ],
  },
  {
    key: 'condition',
    name: 'Condition',
    options: ['New', 'Refurbished', 'Used - Like New'],
  },
  {
    key: 'connectivity',
    name: 'Connectivity',
    options: ['Bluetooth', 'Wi-Fi', 'USB-C', 'Wired'],
  },
];

const attributesFurnitureCommon: CategorySeedAttribute[] = [
  { key: 'material', name: 'Material', options: ['Wood', 'Skin', 'Plastic', 'Metal'] },
  { key: 'color', name: 'Color', options: ['Oak', 'Walnut', 'White', 'Black'] },
  { key: 'room', name: 'Room', options: ['Living room', 'Bedroom', 'Office', 'Dining room'] },
];

const attributesBathroomCommon: CategorySeedAttribute[] = [
  { key: 'material', name: 'Material', options: ['Cotton', 'Microfiber', 'Bamboo'] },
  { key: 'color', name: 'Color', options: ['White', 'Gray', 'Blue', 'Pink'] },
  { key: 'towel_type', name: 'Towel type', options: ['Hand towel', 'Face towel', 'Bath towel'] },
];

const attributesBooksCommon: CategorySeedAttribute[] = [
  { key: 'language', name: 'Language', options: ['English', 'Vietnamese', 'Japanese'] },
  { key: 'format', name: 'Format', options: ['Paperback', 'Hardcover', 'Digital'] },
  { key: 'audience', name: 'Audience', options: ['Kids', 'Teens', 'Adults'] },
];

const attributesVideoGameTitleCommon: CategorySeedAttribute[] = [
  { key: 'genre', name: 'Genre', options: ['Action', 'Adventure', 'Sports', 'RPG'] },
  { key: 'mode', name: 'Mode', options: ['Single player', 'Multiplayer', 'Co-op'] },
  { key: 'age_rating', name: 'Age rating', options: ['E', 'E10+', 'T', 'M'] },
];

const attributesConsoleCommon: CategorySeedAttribute[] = [
  { key: 'storage', name: 'Storage', options: ['512GB', '1TB', '2TB'] },
  { key: 'condition', name: 'Condition', options: ['New', 'Refurbished', 'Used - Good'] },
  { key: 'region', name: 'Region', options: ['US', 'EU', 'Japan', 'Region free'] },
];

export const categorySeedData: CategorySeedNode[] = [
  {
    name: 'Fashion',
    rank: 1,
    imageFilename: 'categories/fashion.jpg',
    featuredFacetKeys: ['color', 'material', 'gender'],
    children: [
      {
        name: 'Man Fashion',
        rank: 1,
        imageFilename: 'categories/man-fasion.jpg',
        featuredFacetKeys: ['color', 'material', 'gender'],
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
        name: 'Women\'s Fashion',
        rank: 2,
        imageFilename: 'categories/women-fasion.jpg',
        featuredFacetKeys: ['color', 'material', 'gender'],
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
        featuredFacetKeys: ['color', 'material', 'gender'],
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
            attributes: attributesShoesCommon,
          },
          {
            name: 'Boots',
            rank: 2,
            attributes: attributesShoesCommon,
          },
        ],
      },
      {
        name: 'Bags & Purses',
        rank: 5,
        imageFilename: 'categories/bags-purses.png',
        featuredFacetKeys: ['color', 'material'],
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
      {
        name: 'Keyboard',
        rank: 4,
        attributes: attributesElectronicsCommon,
      },
      {
        name: 'Mouse',
        rank: 5,
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
      {
        name: 'Sculpture',
        rank: 3,
        attributes: attributesArtCommon,
        children: [
          {
            name: 'Figurines',
            rank: 1,
            attributes: [
              ...attributesArtCommon,
              {
                key: 'display_style',
                name: 'Display style',
                options: ['Shelf', 'Desk', 'Collector display', 'Wall accent'],
              },
            ],
          },
        ],
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
            attributes: attributesFurnitureCommon,
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
            attributes: attributesBathroomCommon,
          },
        ],
      },
      {
        name: 'Spirituality & Religion',
        rank: 3,
        attributes: attributesArtCommon,
        children: [
          {
            name: 'Religious Home & Decor',
            rank: 1,
            attributes: attributesArtCommon,
          },
        ],
      },
      {
        name: 'Home Decor',
        rank: 4,
        attributes: attributesArtCommon,
      },
    ],
  },
  {
    name: 'Books, Films & Music',
    rank: 5,
    imageFilename: 'categories/books-films-music.png',
    children: [
      {
        name: 'Books',
        rank: 1,
        children: [
          {
            name: 'Religion & Spirituality Books',
            rank: 1,
            attributes: [...attributesBooksCommon, ...attributesArtCommon],
          },
        ],
      },
    ],
  },
  {
    name: 'Toys & Games',
    rank: 6,
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
              {
                name: 'Xbox games',
                rank: 1,
                attributes: attributesVideoGameTitleCommon,
              },
              {
                name: 'Playstation games',
                rank: 2,
                attributes: attributesVideoGameTitleCommon,
              },
            ],
          },
          {
            name: 'Console game',
            rank: 2,
            children: [
              {
                name: 'Xbox',
                rank: 1,
                attributes: attributesConsoleCommon,
              },
              {
                name: 'Playstation',
                rank: 2,
                attributes: attributesConsoleCommon,
              },
            ],
          },
          {
            name: 'Accessories console',
            rank: 3,
            attributes: [
              {
                key: 'accessory_type',
                name: 'Type accessory',
                options: ['Cable', 'Gamepad', 'Controller'],
              },
              {
                key: 'compatibility',
                name: 'Compatibility',
                options: ['Xbox', 'Playstation', 'PC', 'Universal'],
              },
              {
                key: 'connection_type',
                name: 'Connection type',
                options: ['Wired', 'Wireless'],
              },
            ],
          },
        ],
      },
      {
        name: 'Toys',
        rank: 2,
        imageFilename: 'categories/puppets.webp',
        children: [
          {
            name: 'Figurines',
            rank: 1,
            attributes: [
              { key: 'material', name: 'Material', options: ['Paper', 'Plastic', 'Wood'] },
              { key: 'character', name: 'Character', options: ['Animal', 'Fantasy', 'Human'] },
              { key: 'age_group', name: 'Age group', options: ['3+', '6+', '12+'] },
            ],
          },
        ],
      },
      {
        name: 'Games & Puzzles',
        rank: 3,
        children: [
          {
            name: 'Board Games',
            rank: 1,
            attributes: [
              {
                key: 'game_type',
                name: 'Game type',
                options: ['Chess', 'Strategy', 'Abstract', 'Family'],
              },
              {
                key: 'player_count',
                name: 'Player count',
                options: ['2', '2-4', '2-6'],
              },
              {
                key: 'material',
                name: 'Material',
                options: ['Wood', 'Resin', 'Metal', 'Mixed'],
              },
            ],
          },
          {
            name: 'Card Games',
            rank: 2,
            attributes: [
              { key: 'player_count', name: 'Player count', options: ['2', '2-4', '2-6', '4-8'] },
              {
                key: 'game_type',
                name: 'Game type',
                options: ['Poker', 'Strategy', 'Party', 'Classic'],
              },
              {
                key: 'travel_ready',
                name: 'Travel ready',
                options: ['Yes', 'No'],
              },
            ],
          },
        ],
      },
    ],
  },
];
