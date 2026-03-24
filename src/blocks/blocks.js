// Block type IDs
export const BLOCK = {
  AIR:         0,
  GRASS:       1,  // green top, dirt sides — surface layer
  DIRT:        2,  // brown earth
  STONE:       3,  // gray rock
  SAND:        4,  // beach / desert
  WATER:       5,  // lakes and rivers (solid, walkable on top)
  WOOD:        6,  // tree trunk
  LEAVES:      7,  // tree canopy
  COAL_ORE:    8,  // common underground ore
  IRON_ORE:    9,  // moderate depth ore
  DIAMOND_ORE: 10, // deep rare ore
  BEDROCK:     11, // unbreakable bottom layer
  // Crafted blocks
  STONE_BRICK: 12, // crafted from stone — smooth building block
  PLANK:       13, // crafted from wood — lighter boards
  GLASS:       14, // crafted from sand — pale blue block
  IRON_BLOCK:  15, // crafted from iron ore — metallic silver
  // Food
  MUSHROOM:    16, // red mushroom — break and eat with F
};

// Colors — GRASS is special: top face is green, sides are dirt-brown (handled in Chunk.js)
export const BLOCK_COLOR = {
  [BLOCK.AIR]:         null,
  [BLOCK.GRASS]:       0x5da832,  // green (top) — sides use DIRT color in Chunk.js
  [BLOCK.DIRT]:        0x8a5c2a,  // warm brown
  [BLOCK.STONE]:       0x8a8a8a,  // medium gray
  [BLOCK.SAND]:        0xd4c878,  // warm tan
  [BLOCK.WATER]:       0x2266cc,  // deep blue
  [BLOCK.WOOD]:        0x6b4423,  // dark brown
  [BLOCK.LEAVES]:      0x2d8a1a,  // forest green
  [BLOCK.COAL_ORE]:    0x555555,  // dark gray
  [BLOCK.IRON_ORE]:    0x9a7a5a,  // stone with warm tint
  [BLOCK.DIAMOND_ORE]: 0x22b8d4,  // bright cyan
  [BLOCK.BEDROCK]:     0x222222,  // near-black
  [BLOCK.STONE_BRICK]: 0xaa9988,  // warm light stone
  [BLOCK.PLANK]:       0xc8943a,  // light yellow-brown
  [BLOCK.GLASS]:       0xaaddff,  // pale blue
  [BLOCK.IRON_BLOCK]:  0xd0d0d0,  // silver
  [BLOCK.MUSHROOM]:    0xcc4422,  // Minecraft red mushroom
};

// Dirt color used for grass block side + bottom faces
export const DIRT_COLOR = 0x8a5c2a;

// Human-readable name for each block
export const BLOCK_NAME = {
  [BLOCK.AIR]:         'Air',
  [BLOCK.GRASS]:       'Grass',
  [BLOCK.DIRT]:        'Dirt',
  [BLOCK.STONE]:       'Stone',
  [BLOCK.SAND]:        'Sand',
  [BLOCK.WATER]:       'Water',
  [BLOCK.WOOD]:        'Wood',
  [BLOCK.LEAVES]:      'Leaves',
  [BLOCK.COAL_ORE]:    'Coal Ore',
  [BLOCK.IRON_ORE]:    'Iron Ore',
  [BLOCK.DIAMOND_ORE]: 'Diamond Ore',
  [BLOCK.BEDROCK]:     'Bedrock',
  [BLOCK.STONE_BRICK]: 'Stone Brick',
  [BLOCK.PLANK]:       'Plank',
  [BLOCK.GLASS]:       'Glass',
  [BLOCK.IRON_BLOCK]:  'Iron Block',
  [BLOCK.MUSHROOM]:    'Mushroom (F to eat)',
};

export function isSolid(blockId) {
  return blockId !== BLOCK.AIR;
}

export function isBreakable(blockId) {
  return blockId !== BLOCK.AIR && blockId !== BLOCK.BEDROCK;
}

export function isPlaceable(blockId) {
  return blockId !== BLOCK.AIR && blockId !== BLOCK.MUSHROOM;
}

// Hunger restored when eaten (0 = not food)
export function eatValue(blockId) {
  if (blockId === BLOCK.MUSHROOM) return 30;
  return 0;
}
