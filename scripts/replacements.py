"""Family shortlists for IDs added to the Java 26.3 world-generation comparison."""
import re
from measure import DYE

DIRECT='Direct counterpart'; BUILD='Build substitute'; VISUAL='Visual only'; EMPTY='Exact empty space'; ABSENT='No standalone block'
TREES='Maple Aspen Pine Cedar Plum Jungle Cherry Palm Mango Pear Spectral'.split()
WOOD='dark_oak pale_oak oak spruce birch jungle acacia cherry poplar mangrove crimson warped bamboo'.split()

def title(s):return s.replace('_',' ').title()
def names(s):return tuple(s.split('|')) if isinstance(s,str) else tuple(s)

def R(t,g,c='',n='',fix=None):return (t,g,names(c) if c else (),n,fix)

def recipe(k,a,legacy):
 p=title(k)
 if k=='void_air':return R('Engineering & technical',EMPTY,'Air','An empty voxel, like Bloxd Air. The separate Void Air ID and out-of-bounds semantics are not preserved.','Air')
 if k=='barrier':return R('Engineering & technical',BUILD,'Invisible Solid','Invisible collision candidate in the Bloxd registry; does not reproduce Minecraft’s barrier item/editor markers. Both are invisible by default.','Invisible Solid')
 if k=='light':return R('Lighting',BUILD,'Invisible White Light','Registered invisible light fixture. Minecraft’s Light has levels 0–15; this is not a level-for-level mapping. No visible texture to score.','Invisible White Light')
 if k=='structure_void':return R('Engineering & technical',ABSENT,n='A Minecraft template marker, not ordinary Air or a visible material. No matching Bloxd template-placement semantics or visible swatch.')

 dye=next((x for x in DYE if k.startswith(x+'_')),None)
 if dye:
  d=title(dye); rest=k[len(dye)+1:]; cat='Dyed building blocks'
  if rest in ('wool','carpet','bed','concrete'):
   nm=d+' '+title(rest);return R(cat if rest!='bed' else 'Decor & furnishings',DIRECT,[nm], 'Same dye and broad block role. Texture, crafting and gameplay can differ.',nm)
  if rest=='stained_glass':return R(cat,DIRECT,[d+' Glass','Patterned '+d+' Glass'],'Same dye glass family; alpha and borders are independently measured.',d+' Glass')
  if rest=='stained_glass_pane':return R(cat,VISUAL,[d+' Glass','Patterned '+d+' Glass'],'Bloxd glass is a full cube, not a thin connecting pane; no pane collision or joining rules.')
  if rest in ('banner','wall_banner'):
   nm=d+' Banner';variant=nm+'|meta|rot1|side' if rest=='wall_banner' else nm
   return R('Decor & furnishings',BUILD,[variant,nm],'Plain banner color. Java patterns, wall positioning and animations do not transfer.',variant if variant in a.entries else nm)
  if rest=='terracotta':return R(cat,BUILD,[d+' Baked Clay',d+' Chalk',d+' Concrete'],'Matches the dye palette within colored mass materials, not exact terracotta hues or crafting.')
  if rest=='glazed_terracotta':return R(cat,BUILD,[d+' Ceramic',d+' Chalk Bricks',d+' Baked Clay'],'Similar glazed decorative role; the patterned tile and its orientation can differ.',d+' Ceramic')
  if rest=='concrete_powder':return R(cat,VISUAL,[d+' Chalk',d+' Baked Clay',d+' Concrete','Sand'],'Color and texture substitute. Does not fall like Minecraft concrete powder or harden when wet.')
  if rest in ('concrete_slab','concrete_stairs','wool_slab','wool_stairs'):
   kind,form=rest.split('_');nm=d+' Concrete '+title(form);pool=[nm,d+' Chalk '+title(form),d+' Chalk Bricks '+title(form)]
   if kind=='concrete':return R(cat,DIRECT,pool,'Same general dyed concrete profile. Straight stair or bottom slab measured; outer and inner variants were not all scored.',nm)
   return R(cat,BUILD,pool,'Same-colored slab/stair silhouette, not a verified Bloxd wool profile; hardness, softness and texture differ.')
  if rest=='candle':return R('Lighting',VISUAL,[d+' Torch','White Torch','Torch'],'Small colored light fixture only. Lit single candle measured; no equivalent wax, stack or extinguish state.')
  if rest=='candle_cake':return R('Decor & furnishings',VISUAL,[d+' Chalk Slab','White Chalk Slab','White Chalk Bricks Slab','White Carpet',d+' Torch'],'No one-block candle-on-cake. The pick is a colored base or light prop, not a lit edible cake.')
  if rest=='shulker_box':return R('Storage',BUILD,'Chest|Iron Chest|Moonstone Chest|Crate|Ghost Chest','Container silhouette or color substitute; not a portable shulker box with contents, dye, or opening animation.')

 if k.startswith('potted_'):
  plant=k.removeprefix('potted_'); base={'azalea_bush':'azalea','flowering_azalea_bush':'flowering_azalea'}.get(plant,plant)
  est=legacy.get(base,{}).get('Bloxd exact block or state name','');
  if base not in legacy and base!=k:
   _,_,pool,_,pinned=recipe(base,a,legacy); picks=[x for x in (pinned,*pool[:5]) if x];
  else:picks=[est] if est else []
  return R('Plants & agriculture',VISUAL,[*picks,'Boiling Pot','Hollow Crate'],'Plant accent or container only. No single block matches a miniature terracotta pot with this plant; one-block colors include the pot.')

 copper=k.removeprefix('waxed_'); ox=next((x for x in ('exposed','weathered','oxidized') if copper.startswith(x+'_')),''); obj=copper.removeprefix(ox+'_') if ox else copper
 if 'copper' in obj or obj=='lightning_rod':
  cat='Copper & oxidation';flag=' No Bloxd wax state or Java-style oxidation was verified.'
  fam=['Dark Green Bricks','Green Bricks','Green Stone','Cyan Chalk Bricks','Green Chalk Bricks','Cyan Chalk','Green Chalk'] if ox in ('weathered','oxidized') else ['Copper Block','Brown Chalk Bricks','Orange Chalk Bricks','Brown Chalk','Orange Chalk','Engraved Red Sandstone','Red Sandstone Bricks','Red Sandstone']
  if obj in ('copper_block','copper') and not ox: return R(cat,DIRECT,['Copper Block'],'Refined copper family; actual creative availability can depend on mode.'+flag,'Copper Block')
  if obj in ('copper','copper_block','cut_copper','chiseled_copper'):return R(cat,BUILD,fam,'Panel/copper palette substitute; embossing and patina differ.'+flag)
  if obj in ('cut_copper_slab','cut_copper_stairs'):
   typ='Slab' if obj.endswith('slab') else 'Stairs'
   return R(cat,BUILD,[u+' '+typ for u in fam]+[('Cyan' if ox in ('weathered','oxidized') else 'Brown')+' Concrete '+typ],'Keeps the slab or stair profile, not matching copper material.'+flag)
  if obj in ('copper_door','copper_trapdoor'):
   typ='Door' if obj.endswith('_door') else 'Trapdoor'
   return R(cat,BUILD,[w+' '+typ for w in TREES],'Same broad opening profile, made of Bloxd’s wood. Not a metal door/trapdoor or redstone port.'+flag)
  if obj=='copper_chest':return R(cat,BUILD,'Chest|Iron Chest|Moonstone Chest|Ghost Chest|Crate','Closest container within the available palette; no copper-golem item sorting.'+flag)
  if obj=='copper_golem_statue':return R(cat,VISUAL,[*fam,'Gold Trophy','Iron Trophy','Small Cyan Pod','Small Orange Pod'],'Decorative only. No matching copper golem or pose-dependent statue.'+flag)
  if obj=='copper_lantern':return R(cat,VISUAL,'Lantern|Cyan Torch|Green Torch|Orange Torch','Use Lantern for the profile or a colored torch for tint. No copper version with the same texture.'+flag,'Lantern')
  if obj in ('copper_torch','copper_wall_torch'):
   L=['Green Torch','Cyan Torch','Lime Torch','Torch']; L=[s+'|meta|rot1|side' for s in L] if '_wall_' in obj else L
   return R('Lighting',BUILD,L,'Similar colored light fixture; texture and rendered light can differ.')
  if obj=='copper_bulb':return R(cat,VISUAL,'Dim Lamp Off|Dim Lamp On|Glow Lamp|Green Neon|Cyan Neon|Orange Neon','Similar fixture/appearance. Not a redstone-driven copper latch.'+flag)
  if obj=='copper_bars':return R(cat,VISUAL,'Iron Ladder|Scaffolding|Patterned Orange Glass|Patterned Cyan Glass|Patterned Green Glass','Grille look only; no exact thin connecting bars or collision.'+flag)
  if obj=='copper_grate':return R(cat,VISUAL,('Patterned Cyan Glass|Patterned Green Glass|Scaffolding' if ox in ('oxidized','weathered') else 'Patterned Orange Glass|Patterned Brown Glass|Scaffolding'),'Perforated-looking substitute. Does not transfer waterlogging or wax/oxidation.'+flag)
  if obj=='copper_chain':return R(cat,VISUAL,['Wire|meta|conn|ny_py','Dangling Rope','Iron Ladder'],'Thin hanging element only. No interlocking copper links or patina behavior.')
  if obj=='lightning_rod':return R(cat,VISUAL,['Wire|meta|conn|ny_py','Gold Spikes','Iron Spikes','Stone Spikes'],'Narrow metallic-looking prop; does not redirect lightning or power redstone.'+flag)

 if k.startswith('dead_') and 'coral' in k:
  if k.endswith('_block'):return R('Plants & agriculture',BUILD,'Gray Chalk Bricks|Gray Baked Clay|Gray Wool|Gray Chalk|Andesite|Carved Messy Stone','Gray decorative cube; not dead coral or an aquatic substitute.')
  return R('Plants & agriculture',VISUAL,'Dead Bush|Small Gray Pod|Small Light Gray Pod|Gray Carpet|Iron Spikes','Gray or branching décor only. No dead coral fan, wall mount, or matching underwater behavior.')

 woodk=k.removeprefix('stripped_'); wood=next((w for w in WOOD if woodk.startswith(w+'_')),None)
 if wood:
  form=woodk[len(wood)+1:]; stripped=k.startswith('stripped_'); cat='Wood & foliage'
  if form in ('sign','wall_sign','hanging_sign','wall_hanging_sign'):
   p='Noticeboard Wall' if 'wall' in form or 'hanging' in form else 'Standing Noticeboard'
   return R('Decor & furnishings',BUILD,[p,'Noticeboard','Standing Noticeboard'],'Fills the signage role. Bloxd noticeboards are larger; mount, text editing and Java wax rules are different.',p)
  if form=='shelf':return R('Decor & furnishings',VISUAL,'Empty Bookshelf|Bookshelf|Crate|Maple Slab','Decorative shelf/profile only. No same 3-slot display, linked shelves or redstone access.')
  if form in ('button','pressure_plate'):
   opts=['Brown Carpet','Orange Carpet','White Carpet','Cyan Carpet','Light Gray Carpet']+[u+' Trapdoor' for u in TREES];
   return R('Engineering & technical',VISUAL,opts,'A small/thin decorative accent, not a button or pressure detector. It cannot produce a Minecraft redstone signal.')
  if form in ('wood','log','stem','hyphae','block'):
   if form=='block' and wood!='bamboo':pass
   else:
    opts=[('Barkless ' if stripped else '')+u+' Log' for u in TREES]
    if stripped or form!='log':return R(cat,BUILD,opts,'Related log/bark family. Default Bloxd logs often use the side tile on all faces; axis and end-grain/stripping are different.')
    return R(cat,BUILD,opts,'Logs compared upright; end-grain and side color should be inspected separately.')
  if form in ('planks','mosaic','mosaic_slab','mosaic_stairs','slab','stairs','trapdoor','door','fence','fence_gate','sapling'):
   f={'planks':'Wood Planks','mosaic':'Wood Planks','mosaic_slab':'Slab','mosaic_stairs':'Stairs'}.get(form,title(form)); choices=[u+' '+f for u in TREES]
   n='Measured within the same wood-profile shortlist. Material and growth/placement rules differ.'
   if wood=='bamboo':n+=' This is a wood visual substitute, not a bamboo stalk or mosaic texture.'
   if wood in ('jungle','cherry'):
    pref=title(wood)+' '+f
    if pref in a.roots:return R(cat,DIRECT,choices,'Same named Bloxd wood family and broad profile. Grain and game behavior may differ.',pref)
   return R(cat,BUILD,choices,n)

 G={
  'andesite':['Andesite'],'polished_andesite':['Smooth Andesite'], 'polished_diorite':['Smooth Diorite'],'polished_granite':['Smooth Granite'],'granite':['Granite'],
  'stone':['Stone'],'stone_brick':['Stone Bricks'],'tuff':['Andesite','Rocky Dirt','Gray Chalk','Gray Concrete','Stone'],'polished_tuff':['Smooth Andesite','Smooth Stone','Gray Concrete','Andesite Bricks'],'tuff_brick':['Andesite Bricks','Stone Bricks','Gray Chalk Bricks','Mossy Stone Bricks'],
  'end_stone_brick':['Sandstone Bricks','Yellow Chalk Bricks','White Chalk Bricks','Diorite Bricks'], 'red_sandstone':['Red Sandstone'],'cut_red_sandstone':['Marked Red Sandstone','Red Sandstone'],'cut_sandstone':['Marked Sandstone','Sandstone'],'smooth_red_sandstone':['Smooth Red Sandstone'],
  'polished_blackstone':['Smooth Darkstone','Black Chalk','Gray Concrete','Black Concrete','Gray Chalk'], 'nether_brick':['Dark Red Brick','Black Concrete','Black Chalk Bricks','Darkstone Bricks','Gray Concrete','Brown Concrete'],
  'red_nether_brick':['Dark Red Brick','Red Concrete','Red Chalk Bricks','Brown Chalk Bricks','Red Sandstone Bricks'],
  'quartz':['Block of Quartz','Smooth Diorite','White Concrete','White Chalk'], 'smooth_quartz':['Block of Quartz','Smooth Diorite','White Concrete','White Chalk'],
  'prismarine':['Green Stone','Green Bricks','Dark Green Bricks','Cyan Chalk Bricks','Cyan Concrete','Cyan Chalk'], 'prismarine_brick':['Dark Green Bricks','Green Bricks','Cyan Chalk Bricks','Green Chalk Bricks'], 'dark_prismarine':['Dark Green Bricks','Green Chalk Bricks','Cyan Chalk Bricks','Cyan Concrete'],
  'cinnabar':['Dark Red Stone','Red Baked Clay','Red Concrete','Red Sandstone','Red Chalk'], 'polished_cinnabar':['Red Concrete','Smooth Red Sandstone','Red Chalk','Red Sandstone','Brown Chalk'], 'cinnabar_brick':['Red Chalk Bricks','Dark Red Brick','Red Sandstone Bricks','Red Concrete','Brown Chalk Bricks'],
  'sulfur':['Yellow Chalk','Yellow Concrete','Sandstone','Yellowstone'], 'polished_sulfur':['Yellow Concrete','Yellow Chalk','Smooth Sandstone','Yellowstone'], 'sulfur_brick':['Yellow Chalk Bricks','Sandstone Bricks','Yellow Chalk','Yellow Concrete'],
  'resin_brick':['Orange Chalk Bricks','Red Sandstone Bricks','Orange Concrete','Orange Chalk','Brown Chalk Bricks'],
 }
 forms=re.match(r'(.+)_(slab|stairs|wall)$',k)
 if forms and forms[1] in G:
  f=forms[2]; base=G[forms[1]]; cat='Masonry & profiles'
  if f=='wall':return R(cat,VISUAL,base,'Material and color only. The substitute is a cube, not a narrow, auto-connecting wall or the same hitbox.')
  cand=[n+' '+title(f) for n in base]; valid=[x for x in cand if x in a.roots];
  if not valid: cand+=['Stone '+title(f),'Gray Chalk '+title(f),'Smooth Stone '+title(f)]
  return R(cat,DIRECT if len(base)==1 and cand[0] in a.roots else BUILD,cand,'Straight stair or bottom slab compared in the same profile family; texture and mechanical properties can differ.',cand[0] if len(base)==1 and cand[0] in a.roots else None)

 if k in ('polished_blackstone_button','polished_blackstone_pressure_plate','light_weighted_pressure_plate','heavy_weighted_pressure_plate'):
  return R('Engineering & technical',VISUAL,'Gray Carpet|Black Carpet|Yellow Carpet|Gray Concrete Slab|Black Concrete Slab|Yellow Chalk Slab','Thin surface only. No weight sensing, timed press, or compatible redstone output.')
 if k.endswith('_rail'):
  return R('Engineering & technical',VISUAL,['Iron Ladder','Wire|meta|conn|nx_px','Patterned Light Gray Glass','Light Gray Chalk Slab'],'Metal grille/line decal only; Bloxd does not reproduce this minecart rail or its power/detection.')
 if k.startswith(('chain_command_','repeating_command_','command_block','structure_block','test_block','test_instance_','jigsaw')):
  pool='Gray Chalk Bricks|Light Gray Chalk Bricks|Orange Chalk Bricks|Purple Ceramic|Cyan Ceramic|Chiseled Block of Quartz|Black Chalk Bricks'
  return R('Engineering & technical',VISUAL,pool,'Purely visual block. No Minecraft commands, structure templates, testing hooks or world-generation control are reproduced.')
 if k in ('observer','piston','dropper','crafter','daylight_detector','calibrated_sculk_sensor'):
  P={'observer':'Stone Bricks|Wire Mill|Darkstone Bricks|Forge Hopper','piston':'Sorting Gate|Block of Iron|Stone Bricks|Machine Bench','dropper':'Stone Bricks|Furnace|Extractor Pipe|Gray Chalk Bricks','crafter':'Workbench|Artisan Bench|Machine Bench|Crate','daylight_detector':'Solar Panel|White Chalk Slab|Light Gray Chalk Slab','calibrated_sculk_sensor':'Crystal|Small Purple Pod|Darkstone Bricks|Purple Chalk'}
  return R('Engineering & technical',VISUAL,P[k],'An appearance/role cue only. Its Java redstone, crafting automation, vibration calibration or motion does not transfer.')

 if k.endswith(('_head','_skull')):
  P='Small Lime Pod|Small Green Pod|Green Chalk|Small Gray Pod' if k.startswith(('creeper','zombie')) else 'Small Brown Pod|Small Pink Pod|Small Orange Pod|Brown Chalk' if k.startswith(('piglin','player')) else 'Small Black Pod|Darkstone|Black Wool|Cracked Darkstone Bricks' if k.startswith(('dragon','wither')) else 'Small Light Gray Pod|Bone Block|Light Gray Chalk'
  return R('Decor & furnishings',VISUAL,P,'Color/size reference only; no recognizable mob/player head, wall mount, animation or equip behavior. Player skins are variable.')

 if k in ('soul_torch','soul_wall_torch'):
  pool=['Cyan Torch','Light Blue Torch','Blue Torch'];
  if 'wall' in k:pool=[x+'|meta|rot1|side' for x in pool]
  return R('Lighting',BUILD,pool,'Blue light fixture and verified mount when applicable. No identical flame, lighting level, or recipe.')
 if k.endswith('froglight'):
  colors={'ochre':['Yellow Neon','Glow Lamp','Yellow Chalk'],'verdant':['Green Neon','Lime Neon','Glow Lamp','Green Stone'],'pearlescent':['White Neon','Light Gray Neon','Pink Neon','Glow Lamp']}
  return R('Lighting',BUILD,colors[k.split('_')[0]],'Pale/luminous cube replacement only. No frog production, rings, or exact emitted light.')
 if k.endswith('candle_cake') or k=='cake':return R('Decor & furnishings',VISUAL,'White Chalk Slab|White Chalk Bricks Slab|White Carpet|Brown Chalk Slab|Yellow Chalk Slab','Decorative thin block. No one-for-one edible cake, bites, or candle mounting.')

 S={
  'beacon':('Lighting',BUILD,'Beacon|White Neon|Light Blue Glass','Beam-like role or color only. No Java mineral pyramid, beam tinting, or status-effects mechanic.','Beacon'),
  'conduit':('Lighting',VISUAL,'Beacon|Crystal|Glow Lamp|Small Cyan Pod','Decoration only; no underwater conduit power or prismarine activation.',None),
  'beehive':('Plants & agriculture',VISUAL,'Crate|Hollow Crate|Hay Bale|Chest','Wooden container look only; no bee colony, honey or redstone state.',None),
  'anvil':('Utility',VISUAL,'Salvaging Table|Stone Enchanting Table|Forge Hopper|Iron Chest','Heavy workstation prop; no falling, repairs, naming, or anvil wear.',None),
  'chipped_anvil':('Utility',VISUAL,'Salvaging Table|Stone Enchanting Table|Forge Hopper|Iron Chest','Heavy workstation prop; no repair/naming or corresponding chipped state.',None),
  'chiseled_bookshelf':('Decor & furnishings',BUILD,'Empty Bookshelf|Bookshelf|Crate','Similar bookshelf; Java book-slot interactions and comparator behavior are not carried over. Empty Java slots sampled.','Empty Bookshelf'),
  'enchanting_table':('Utility',BUILD,'Stone Enchanting Table|Iron Enchanting Table|Gold Enchanting Table|Wood Enchanting Table|Diamond Enchanting Table','Comparable enchanting station in Bloxd. Bookshelf dependence, recipe/effect rules and table geometry differ.',None),
  'lava_cauldron':('Utility',VISUAL,'Boiling Pot|Forge Hopper|Lava','Container/look only; no Bloxd counterpart for a filled Minecraft cauldron with bucket interactions.','Boiling Pot'),
  'dried_kelp_block':('Plants & agriculture',BUILD,'Dark Green Bricks|Green Chalk Bricks|Green Wool|Hay Bale|Green Baked Clay','Compressed plant/green palette only, not Java’s kelp fuel/storage recipe.',None),
  'emerald_block':('Ores & minerals',DIRECT,'Block of Emerald','Same named mineral block; tiles/recipes differ.','Block of Emerald'),
  'iron_block':('Ores & minerals',DIRECT,'Block of Iron','Same broad iron storage/building role, not identical color/recipe.','Block of Iron'),
  'netherite_block':('Ores & minerals',BUILD,'Darkstone|Darkstone Bricks|Black Baked Clay|Obsidian|Black Concrete','Dark metal color cue only; no Netherite resource, beacon-base behavior or fireproof drops.',None),
  'raw_gold_block':('Ores & minerals',BUILD,'Block of Gold|Gold Ore|Yellow Chalk Bricks|Sandstone Bricks','Similar gold palette; refined gold and ore are not raw gold storage nodes.',None),
  'heavy_core':('Ores & minerals',VISUAL,'Block of Iron|Iron Chest|Darkstone Bricks|Gray Chalk Bricks','Metal cube décor only; no Vault reward or heavy-core crafting use.',None),
  'lodestone':('Utility',VISUAL,'Engraved Stone|Chiseled Block of Quartz|Stone Bricks|Block of Iron','Carved stone/color stand-in, not a compass anchor.',None),
  'respawn_anchor':('Utility',VISUAL,'Obsidian|Purple Neon|Engraved Darkstone|Darkstone Bricks','No Minecraft respawn charges, glowstone recharge, or Nether respawn behavior.',None),
  'jukebox':('Utility',VISUAL,'Crate|Chest|Wood Enchanting Table|Brown Chalk Bricks','Wood prop only. Does not play Minecraft records or output its comparator signal.',None),
  'sponge':('Utility',DIRECT,'Sponge','Same sponge material counterpart. Water absorption and wet state are not guaranteed in Bloxd.','Sponge'),
  'slime_block':('Utility',VISUAL,'Slime Trail|Lime Glass|Lime Chalk|Lime Wool','Translucent/green visual only; Slime Trail is not a matching elastic full block or piston adhesive.',None),
  'honey_block':('Utility',VISUAL,'Orange Glass|Yellow Glass|Orange Chalk|Yellow Chalk','Honey-like tint or transparency only. No exact sticking, slide, piston behavior or recipes.',None),
  'honeycomb_block':('Decor & furnishings',BUILD,'Yellow Chalk Bricks|Orange Chalk Bricks|Yellow Baked Clay|Orange Ceramic','Warm patterned decoration. Does not preserve the Minecraft honeycomb motif or wax ingredient.',None),
  'scaffolding':('Utility',BUILD,'Scaffolding|Iron Ladder','Same broad build/climb use. Bloxd uses a frame of a different material, with independent climb/support and mode rules.','Scaffolding'),
  'frosted_ice':('Fluids & frost',BUILD,'Ice Bricks|Ice|Packed Snow','Ice visual only. No frost-walker generation or age/melting cycle.',None),
  'tinted_glass':('Dyed building blocks',BUILD,'Black Glass|Gray Glass|Purple Glass|Patterned Black Glass','Dark glass appearance; does not necessarily block game lighting like Minecraft tinted glass.',None),
  'petrified_oak_slab':('Wood & foliage',BUILD,'Maple Slab|Pear Slab|Aspen Slab|Jungle Slab','Oak-tone slab visual only; ordinary wood is not the stone-like legacy petrified material.',None),
  'shulker_box':('Storage',BUILD,'Chest|Iron Chest|Moonstone Chest|Ghost Chest|Crate','Closed storage look; no Java shulker contents persistence, dye, or profile.',None),
  'frogspawn':('Plants & agriculture',VISUAL,'Lily Pad|Slime Trail|White Carpet|Small Green Pod','Surface accent only. No frog eggs, hatch behavior or water dependence.',None),
  'sniffer_egg':('Plants & agriculture',VISUAL,'Small Red Pod|Small Green Pod|Green Chalk Bricks|Red Chalk Bricks','Egg-like color/size reference only; no hatching, exact egg geometry or sniffer.',None),
  'turtle_egg':('Plants & agriculture',VISUAL,'Small White Pod|Small Light Gray Pod|Bone Block|White Chalk','Pale decorative accent; no turtle eggs, clustering, trampling or hatching.',None),
  'golden_dandelion':('Plants & agriculture',VISUAL,'Dandelion|Yellow Torch|Orange Tulip','Warm flower accent only; default dandelion does not replicate the golden flower’s age-related effects.',None),
  'torchflower':('Plants & agriculture',BUILD,'Orange Tulip|Allium|Red Tulip|Dandelion|Glowing Mushroom','Similar flower/colored silhouette. No sniffer seed or torchflower identity.',None),
  'torchflower_crop':('Plants & agriculture',VISUAL,'Orange Tulip|Red Tulip|Carrot Plant_stage1|Dandelion','Plant appearance only; no growth stage transition or seed source equivalent.',None),
  'wither_rose':('Plants & agriculture',BUILD,'Shadow Rose|Dead Bush|Allium','Dark flower look, no Wither effect or creation rule.', 'Shadow Rose'),
  'pitcher_crop':('Plants & agriculture',VISUAL,'Corn Plant|Blueberry Bush_stage2|Jungle Tall Grass|Bluebell','Tall plant substitute only; no pitcher pod, exact growth, or sniffer source.',None),
  'pitcher_plant':('Plants & agriculture',VISUAL,'Jungle Tall Grass|Corn Plant|Allium|Bluebell','Tall/colored plant silhouette only; both Minecraft halves measured.',None),
  'soul_campfire':('Lighting',VISUAL,'Cyan Torch|Light Blue Torch|Lantern|Blue Torch','Blue flame accent only. Not equivalent smoke, log geometry, or cooking behavior.',None),
  'resin_clump':('Decor & furnishings',VISUAL,'Orange Carpet|Small Orange Pod|Orange Chalk|Orange Torch','Orange accent/flat decoration, not a surface clump or creaking resin mechanic.',None),
  'quartz_bricks':('Masonry & profiles',BUILD,'White Chalk Bricks|Diorite Bricks|Block of Quartz|White Ceramic','Light block/brick palette, not the same quartz pattern.',None),
  'quartz_pillar':('Masonry & profiles',BUILD,'Block of Quartz|Chiseled Block of Quartz|White Chalk Bricks|White Concrete','Pale column material only. Side grooves and crystal axis differ.',None),
  'chiseled_quartz_block':('Masonry & profiles',DIRECT,'Chiseled Block of Quartz|Block of Quartz','Same named material/profile. Examine side/top pattern separately.','Chiseled Block of Quartz'),
  'chiseled_red_sandstone':('Masonry & profiles',DIRECT,'Engraved Red Sandstone|Red Sandstone','Same broad carved sandstone profile, not the same motif.','Engraved Red Sandstone'),
  'cut_red_sandstone':('Masonry & profiles',DIRECT,'Marked Red Sandstone|Red Sandstone','Same cut/panel purpose. Side and top texture differ.','Marked Red Sandstone'),
  'smooth_red_sandstone':('Masonry & profiles',DIRECT,'Smooth Red Sandstone|Red Sandstone','Same smooth sandstone building role.','Smooth Red Sandstone'),
  'red_nether_bricks':('Masonry & profiles',BUILD,'Dark Red Brick|Red Chalk Bricks|Red Sandstone Bricks|Red Concrete','Red masonry only; not the modless Nether brick recipe or seams.',None),
  'chiseled_nether_bricks':('Masonry & profiles',BUILD,'Engraved Darkstone|Dark Red Brick|Darkstone Bricks','Dark engraved material cue only; no same chisel motif.',None),
  'cracked_nether_bricks':('Masonry & profiles',BUILD,'Cracked Darkstone Bricks|Dark Red Brick|Darkstone Bricks','Similar cracks/dark masonry, not identical tiles.',None),
  'cinnabar_bricks':('Masonry & profiles',BUILD,G['cinnabar_brick'],'Red masonry alternative only.',None),
  'chiseled_cinnabar':('Masonry & profiles',BUILD,'Engraved Red Sandstone|Red Chalk Bricks|Dark Red Stone|Red Ceramic','Red cut/engraved masonry; motif and color differ.',None),
  'polished_cinnabar':('Masonry & profiles',BUILD,G['polished_cinnabar'],'Smooth red material cue only.',None),
  'sulfur_bricks':('Masonry & profiles',BUILD,G['sulfur_brick'],'Yellow brick palette only. No Java sulfur chemistry.',None),
  'chiseled_sulfur':('Masonry & profiles',BUILD,'Engraved Sandstone|Yellow Chalk Bricks|Yellow Ceramic|Yellowstone','Warm carved masonry; no sulfur or identical motif.',None),
  'polished_sulfur':('Masonry & profiles',BUILD,G['polished_sulfur'],'Smooth golden material; no sulfur mechanics.',None),
  'resin_bricks':('Masonry & profiles',BUILD,G['resin_brick'],'Orange masonry; no resin identity or recipe.',None),
  'chiseled_resin_bricks':('Masonry & profiles',BUILD,'Engraved Red Sandstone|Orange Ceramic|Orange Chalk Bricks|Red Sandstone Bricks','Orange carved masonry; different icon and material.',None),
 }
 if k in S:return R(*S[k])
 raise KeyError(k)
