import type { HeroKind } from '../game/rigs';
import { ICONS } from '../ui/icons';
import { ArcherStage } from './ArcherStage';
import type { BaseStage, StageHost } from './BaseStage';
import { MageStage } from './MageStage';
import { RogueStage } from './RogueStage';
import { WarriorStage } from './WarriorStage';

/** Hub card + intro copy for each stage, in play order. */
export interface StageInfo {
  hero: HeroKind;
  heroName: string;
  title: string;
  /** card subtitle on the Discover hub */
  tagline: string;
  color: string;
  icon: string;
  /** shown on the intro card */
  goal: string;
  tips: string[];
  /** demo coins awarded for clearing */
  bonus: number;
  create(host: StageHost): BaseStage;
}

export const STAGES: StageInfo[] = [
  {
    hero: 'warrior',
    heroName: 'Warrior',
    title: 'Bone Cavern',
    tagline: 'Horde brawler · survive 3 skeleton waves',
    color: '#F58324',
    icon: ICONS.sword,
    goal: 'Skeleton hordes pour out of the cave mouths. Survive all three waves to open the portal.',
    tips: ['<b>Attack</b>: swing at everything in front of you', '<b>Fire Spin</b>: a blazing whirl that burns everything around you', 'Red flash = a skeleton is about to strike'],
    bonus: 100,
    create: (h) => new WarriorStage(h),
  },
  {
    hero: 'mage',
    heroName: 'Fire Mage',
    title: 'Castle Chasm',
    tagline: 'Ranged caster · burn the dark mages',
    color: '#8A1F30',
    icon: ICONS.flame,
    goal: 'Skeleton dark mages and their warlock hold the keep across the chasm. Burn them all and the drawbridge rises.',
    tips: ['<b>Cast</b>: fireballs lock on to the enemy you face', '<b>Inferno</b>: a huge fireball that blasts whole groups', 'Sidestep the dark orbs, and don’t fall in!'],
    bonus: 100,
    create: (h) => new MageStage(h),
  },
  {
    hero: 'archer',
    heroName: 'Archer',
    title: 'Rune Forest',
    tagline: 'Puzzle shooter · open the stone gate',
    color: '#3F6B3A',
    icon: ICONS.bow,
    goal: 'Shoot the rune stones in the order carved on the forest gate. One rune hides behind a spinning shield.',
    tips: ['Face a rune and <b>Shoot</b>, and the arrow locks on', '<b>Frost Volley</b>: 3 ice arrows that freeze bats, and even the spinning shield', 'Shoot through the shield’s gap to hit the hidden rune'],
    bonus: 100,
    create: (h) => new ArcherStage(h),
  },
  {
    hero: 'rogue',
    heroName: 'Rogue',
    title: 'Orc War Camp',
    tagline: 'Night stealth · strike from the shadows',
    color: '#5B3A8A',
    icon: ICONS.dagger,
    goal: 'Orc brutes guard the camp at night. They’re fast and one hit is fatal, so sneak behind them and strike once.',
    tips: ['Stay out of the <b>vision cones</b>; crates block their sight', '<b>Strike</b> from behind for an instant takedown', '<b>Vanish</b> to turn invisible and lose a chase'],
    bonus: 150,
    create: (h) => new RogueStage(h),
  },
];
