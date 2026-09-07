export const BACKPACKS = [
  ['icecream','🍦','Ice cream cone'], ['cat','🐱','Kitten'], ['bear','🧸','Teddy bear'],
  ['bunny','🐰','Bunny'], ['frog','🐸','Frog'], ['basketball','🏀','Basketball'],
  ['glove','⚾','Baseball glove'], ['car','🚗','Toy car'], ['rocket','🚀','Rocket'],
  ['pizza','🍕','Pizza'], ['flower','🌻','Sunflower'], ['controller','🎮','Game controller'],
].map(([id,icon,label])=>({id,icon,label}))
const EYES = [0x83e4ff,0xffa8da,0xc3a0ff,0xffd27c,0x8aefbd,0xffaa87,0xaecbff,0xf2e9a4]
const TINTS = [0xffffff,0xffe7ee,0xe7f2ff,0xf5e5ff,0xe4fff3,0xfff3d9]
const EXPRESSIONS = ['happy','wink','love','idle','cheer','think1']
const NAMES = ['Sunny','Cheeky','Sweetheart','Easygoing','Bubbly','Curious']
export function personalityFor(id) {
  let hash=2166136261
  for(const c of String(id)) { hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619) }
  hash>>>=0
  const backpack=BACKPACKS[hash%BACKPACKS.length], expression=(hash>>>8)%EXPRESSIONS.length
  return {backpack,faceColor:EYES[(hash>>>12)%EYES.length],tint:TINTS[(hash>>>17)%TINTS.length],
    expression:EXPRESSIONS[expression],name:NAMES[expression],greeting:(hash>>>22)%3===0?'dance':'wave',
    idleClip:hash%2?'idle':'idleAlt',scale:0.93+((hash>>>25)%8)*0.02}
}
