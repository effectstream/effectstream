# Tarochi

**Tarochi** is a online decentralized game developed entirely with `Paima Engine`.

<iframe src="https://drive.google.com/file/d/1--jE8nVOyhrPqh5IWmahys2aCrKn23aI/preview" width="640" height="480" allow="autoplay"></iframe>

> This is a development stage video of the game

This guide is intended as guide on demonstrating practical examples on how a game can be developed using `Paima Engine`

# Game Design

We will not deep dive into how the game loop was designed, but rather focus on important game decisions you need to make for a decentralized-blockchain game.
<iframe src="https://drive.google.com/file/d/1yODv3RPxuZfVtqgxes6OCPYVJ8GMqVbD/preview" width="640" height="480" allow="autoplay"></iframe>

## Game Engine Technology 

[GameMaker](https://gamemaker.io/) as used as it compiles to Web and Javascript, that allows to integrate browser extension wallets.

## Tokenomics: 

The Assets are:
*  ERC1155 `Gold` \<- _convertible_ -\> In-Game `Gold`.
*  ERC721 Limited Supply of `Trainer` Assets, usable in game if held in wallet.
*  ERC721 `Monsters` \<- _convertible_ -\> in-Game `Monsters`. `Monsters` can also be captured in game.
*  `Items` are only In-Game

General rules:
* Common monsters are unlimited.
* Rare+ monsters are limited by time.
* Monsters are "scarified" to increment their max level.
* Gold is consumed when used in a store.
* Limited new Gold was minted.
* Trainers limited.

Exchanges and DEX:
*  Gold, Trainers and Monsters where available to mint on EVM and partially on Cardano.
*  Exchanges for Monsters and Trainers where mostly over OpenSea.io and Jpg.store
*  Paima Dex to trade used for Gold over Arbitrum

## Contracts

*  `Paima-L2`  
    This contract is extensively used for game inputs.  
    It is running on XAI network for it's fast block time and low gas fees.
*  `IInverseAppProjectedNft`  
*  `IInverseAppProjected1155`  
*  `IOrderbookDex`  

## Frontend & Wallets

To be able to interact with the `Paima-L2` the game used a browser EVM Wallet and sent transactions to the batcher. Players could connect their real wallets to the game, so they could mint monsters and use the trainer effects. They could connect EVM or Cardano wallets.

Real wallets where needed for some operations where a signature was needed. 

## State Machine 

The Tarochi `State Machine` is a set of triggers for either the contract changes, as if Monster is minted, Gold is Transferred, but mainly in reaction to the `Paima L2` Contract.
Each keyword in the `grammar` was implemented as `State Transition`.

For example:  
`useItem = @c|item|argument?`
First check if the user had the item in the inventory, was in a state where the item could be use. E.g., not in a battle. Then it checked for specific item usage, if all rules where OK, then it proceeded to discount the item and apply the effects.

`fastTravel = @f|x|y`
First checks if the user is in a valid state, checks if the target X-Y is valid, if so then it moves the player to another map, and disables in special effect of the past zone, and applies the new effects.

## Grammar 
```sh
join                    = @j|referrer?
setReferrer             = @k|referrer
rename                  = @rn|*name|fee_wallet
moveToArea              = @m|x|y
fastTravel              = @f|x|y
battleCommand           = @b|battleType|round|action|action_data?
switchMonsters          = @x|swap_commands
startPVEBattle          = @e|npc_trainer_global_id
startPVPBattle          = @p|*player|battle_type?
healCenter              = @h|
useItem                 = @c|item|argument?
purchaseItem            = @r|item|count?|fee_wallet
barter                  = @t|give|amount|receive
excavate                = @z|use_item
claim                   = g|
redeem                  = @w|blockHeight
merge                   = @q|monster_target|monsters
mergeTGold              = @qt|monster_target|fee_wallet
nop                     = n|
arenaBattle             = @n|arena_id
internalCommands        = @a|cmd|id?|args?
buyCaptureItem          = @i|*player
scheduleRandomEncounter = w|*player|x|y
scheduleDaily           = d|tick
scheduleHourly          = h|tick
scheduleQuarterHour     = q|tick
scheduleNoAction        = x|blockHeight|battleType|round|wallet_a|wallet_b
scheduleStatusEffect    = s|*player|item_id|monster_id?
sendGold                = @s|to_player|amount|signature|fee_wallet
lockGold                = @l|amount
sendMonster             = @u|to_player|monster_id|signature|fee_wallet
appMonsterLock          = @d|monster_id|fee_wallet
monster_lock            = monster_lock|payload
monster_burn            = monster_burn|payload
monster_transfer        = monster_transfer|address|nft_id|data?
delegate                = &wd|from?|to?|from_signature|to_signature
migrate                 = &wm|from?|to?|from_signature|to_signature
cancelDelegations       = &wc|to?
createEventTeam         = @ev|event_id
interactEventTeam       = @ei|action|*team_id|data?
event_step              = event_step|event_id|step
event_end               = event_end|event_id
createGuild             = @gc|name|social_link|fee_wallet
interactGuild           = @gi|action|*guild_id|data?
buyForGuild             = @gs|action|*guild_id|fee_wallet
gold_mint               = gold_mint|payload
gold_burn               = gold_burn|operator|from|ids|values
acceptDaily             = @da|*daily_id
forSaleDaily            = @ds|*daily_id|price
cancelDaily             = @dc|*daily_id
purchaseDaily           = @dp|*daily_id|fee_wallet
scheduleDailyQuestEnd   = dq|*daily_id
masterDaily             = @dm|action|payload
giveItem                = i|message|item_id|signature|wallets
dex_order_created       = dex_order_created|payload
dex_order_cancelled     = dex_order_cancelled|payload
dex_order_filled        = dex_order_filled|payload
updateCardanoLink       = @co|token|address
```

## Processes

For the development of Tarochi, it is needed to run:
*  EVM Main Chain with fast block times (emulating XAI)
*  EVM Parallel Chain (emulating Arbitrum)
*  Cardano Parallel Chain
*  Deployment of Contracts
*  Postgres Database
*  Batcher