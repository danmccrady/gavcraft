import { BLOCK } from '../blocks/blocks.js';

export const RECIPES = [
  {
    id: 'stone_brick',
    name: 'Stone Brick',
    description: 'Smooth polished stone — great for building',
    ingredients: { [BLOCK.STONE]: 4 },
    output: { blockId: BLOCK.STONE_BRICK, count: 4 },
  },
  {
    id: 'plank',
    name: 'Plank',
    description: 'Sawn wooden boards from tree trunks',
    ingredients: { [BLOCK.WOOD]: 2 },
    output: { blockId: BLOCK.PLANK, count: 4 },
  },
  {
    id: 'glass',
    name: 'Glass',
    description: 'Melt sand into pale glass blocks',
    ingredients: { [BLOCK.SAND]: 4 },
    output: { blockId: BLOCK.GLASS, count: 4 },
  },
  {
    id: 'iron_block',
    name: 'Iron Block',
    description: 'Smelt iron ore into solid metal blocks',
    ingredients: { [BLOCK.IRON_ORE]: 4 },
    output: { blockId: BLOCK.IRON_BLOCK, count: 2 },
  },
];

export function canCraft(recipe, inventory) {
  for (const [blockId, needed] of Object.entries(recipe.ingredients)) {
    if (inventory.countOf(Number(blockId)) < needed) return false;
  }
  return true;
}

export function craft(recipe, inventory) {
  if (!canCraft(recipe, inventory)) return false;
  for (const [blockId, needed] of Object.entries(recipe.ingredients)) {
    inventory.remove(Number(blockId), needed);
  }
  inventory.add(recipe.output.blockId, recipe.output.count);
  return true;
}
