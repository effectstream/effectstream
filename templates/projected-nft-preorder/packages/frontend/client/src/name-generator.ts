const ADJECTIVES = [
  "desperate", "appalling", "manual", "jolly", "impulsive", "enigmatic", "dark", "continuous",
  "spotty", "astute", "aspiring", "creative", "imaginary", "inscribed", "working", "arbitrary",
  "guided", "spicy", "immune", "terminal", "material", "ace", "faulty", "square",
  "political", "matching", "faint", "hurt", "planned", "daring", "crabby", "rightful",
  "cuddly", "quickest", "pregnant", "logical", "biological", "tragic", "dreadful", "revolutionary",
  "comparative", "monetary", "ragged", "graceful", "civic", "blessed", "inevitable", "miserable",
  "competitive", "insidious", "damaging", "threadbare", "ready", "fierce", "relative", "pure",
  "holy", "lovely", "clever", "foggy", "joint", "filthy", "trusting", "right",
  "lying", "immense", "overrated", "burning", "inflammable", "asymptotic", "okay", "short",
  "lower", "childlike", "horizontal", "offbeat", "hulking", "wet", "selective", "tractable",
  "equipped", "lonely", "juicy", "literary", "straightforward", "shallow", "rainy", "immediate",
  "endurable", "yielding", "vulnerable", "cosmic", "blonde", "dependent", "external", "favourite",
  "spurious", "charitable", "rubbery", "robust", "undecidable", "labored", "administrative", "didactic",
  "loved", "moonlit", "suited", "fascinated", "threatening", "absorbing", "little", "wicked",
  "fuchsia", "wry", "defensive", "narrow", "repulsive", "fermented", "aberrant", "overjoyed",
  "vigorous", "alternative", "detailed", "random", "northern", "inventive", "calm", "involved",
  "constitutional", "venomous", "citric", "driving", "eager", "unruly", "first", "long",
  "stable", "hostile", "hallowed", "oblique", "shaky", "renewing", "surviving", "thick",
  "district", "just", "included", "charming", "plucky", "amiable", "inherent", "acoustic",
  "clean", "capitalist", "infinite", "chocolaty", "assuring", "payable", "internal", "materialistic",
  "vast", "humorous", "elastic", "unique", "itchy", "united", "sleepy", "gold",
  "criminal", "cultural", "stupendous", "puffy", "staking", "smoky", "unchanged", "broken",
  "current", "casual", "shy", "poised", "demonic", "key", "gorgeous", "tense",
  "entertaining", "gaudy", "trusty", "kinetic", "collective", "tangible", "curious", "boxy",
  "aged", "creamy", "interested", "flagrant", "skillful", "vengeful", "useful", "humid",
];

const ANIMALS = [
  "wasp", "howler", "barnacle", "cephalopod", "herring", "aardwolf", "honeybee", "duck",
  "stork", "wolf", "landfowl", "falcon", "jay", "roundworm", "siamese", "wildfowl",
  "mule", "quetzal", "setter", "louse", "caterpillar", "cockatiel", "firefly", "covey",
  "barbel", "osprey", "silkworm", "mollusk", "barracuda", "slug", "frog", "vicuna",
  "baboon", "owl", "lobster", "mamba", "meerkat", "catfish", "trout", "manatee",
  "betta", "clownfish", "bear", "parrot", "beagle", "raven", "cuckoo", "hummingbird",
  "boxer", "octopus", "dingo", "urial", "termite", "aphid", "pinniped", "thrush",
  "jaguar", "quail", "otter", "nightingale", "marten", "galliform", "dragon", "coot",
  "rail", "seahorse", "tuna", "damselfly", "wolverine", "horse", "buzzard", "rat",
  "primate", "flamingo", "lark", "starling", "bedbug", "alligator", "snake", "pinscher",
  "newt", "bobcat", "smelt", "mockingbird", "cornsnake", "mammoth", "spider", "spaniel",
  "grouper", "tern", "diamondback", "harrier", "ermine", "tiglon", "koala", "mongoose",
  "sardine", "flea", "pheasant", "puma", "meadowlark", "turkeys", "raccoon", "mouse",
  "snapper", "quokka", "bobtail", "calico", "shrimp", "borzoi", "bocaccio", "whippet",
  "wallaby", "echidna", "emu", "pelican", "corgie", "gorilla", "stag", "pony",
  "roadrunner", "mammal", "lungfish", "dog", "badger", "blowfish", "rabbit", "whitefish",
  "egret", "asp", "woodpecker", "goat", "butterfly", "porcupine", "dragonfly", "cattle",
  "korat", "moth", "junglefowl", "narwhal", "salamander", "bonobo", "bee", "caribou",
  "monkey", "aotus", "shark", "westie", "platypus", "cardinal", "kestrel", "burmese",
  "armadillo", "flyingfish", "halibut", "swordfish", "gull", "sole", "dinosaur", "bobolink",
  "guanaco", "muskox", "hyena", "reindeer", "dachshund", "centipede", "chimpanzee", "indri",
  "anglerfish", "chinchilla", "possum", "impala", "panda", "eagle", "catshark", "boiga",
  "himalayan", "ape", "limpet", "coyote", "condor", "leech", "grouse", "fly",
  "crawdad", "crab", "takin", "cockatoo", "hoverfly", "gibbon", "elephant", "shepherd",
  "mastodon", "tyrannosaurus", "tick", "tilapia", "giraffe", "ant", "rhinoceros", "starfish",
];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomNftName(): string {
  return capitalize(pick(ADJECTIVES)) + capitalize(pick(ANIMALS));
}
