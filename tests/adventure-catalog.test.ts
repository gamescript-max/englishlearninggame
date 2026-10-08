import assert from "node:assert/strict";
import test from "node:test";
import { adventureCardWordIds, adventureVocabulary, getAdventureWord, getOceanSpecies, oceanEvolution, oceanSpecies, oceanStageForXP, snakeBreeds } from "../lib/adventure-catalog";
import { adventureTasks, getAdventureRound, getAdventureTaskById } from "../lib/adventure-content";
import { words } from "../lib/course";
import { createAdventureProgress, saveAdventureGrowth, validateAdventureProgress } from "../lib/adventure-progress";

test("the complete requested ocean gallery distinguishes real, extinct and mythological creatures", () => {
  assert.equal(oceanSpecies.length, 99);
  assert.equal(new Set(oceanSpecies.map(species => species.id)).size, 99);
  assert.deepEqual([1, 2, 3, 4, 5].map(tier => oceanSpecies.filter(species => species.tier === tier).length), [15, 20, 30, 19, 15]);
  assert.equal(getOceanSpecies("megalodon")!.extinct, true);
  assert.equal(getOceanSpecies("megalodon")!.fictional, false);
  assert.equal(getOceanSpecies("basilosaurus")!.extinct, true);
  assert.equal(getOceanSpecies("blue-whale")!.fictional, false);
  assert.equal(getOceanSpecies("leviathan")!.fictional, true);
  assert.equal(getOceanSpecies("poseidon")!.fictional, true);
  assert.equal(getOceanSpecies("mosasaurus")!.extinct,true);
  assert.equal(getOceanSpecies("mosasaurus")!.fictional,false);
  assert.equal(getOceanSpecies("giant-pliosaur")!.extinct,true);
  assert.equal(getOceanSpecies("abyssal-giant-turtle")!.fictional,true);
  assert.equal(getOceanSpecies("azure-sea-dragon")!.fictional,true);
  assert.equal(getOceanSpecies("unrecognised-animal"), undefined);
  for (const species of oceanSpecies) {
    assert.ok(species.en && species.zh && /^[a-z0-9-]+$/.test(species.id));
    assert.equal(oceanSpecies[species.artIndex].id, species.id);
  }
});

test("twenty-eight gradual ocean transformations have exact boundaries and meaningful named forms", () => {
  assert.equal(oceanEvolution.length, 28);
  assert.equal(getOceanSpecies(oceanEvolution[0].speciesId)!.en, "Fish fry");
  assert.equal(getOceanSpecies(oceanEvolution[19].speciesId)!.en, "Kun");
  assert.equal(getOceanSpecies(oceanEvolution[23].speciesId)!.en, "Azure sea dragon");
  assert.deepEqual(oceanEvolution.slice(24).map(stage => [stage.speciesId,stage.xp]), [["sea-dragon",38000],["poseidon",48000],["sea-guardian",60000],["devourer",75000]]);
  for (let index = 0; index < oceanEvolution.length; index++) {
    const stage = oceanEvolution[index];
    assert.ok(getOceanSpecies(stage.speciesId));
    assert.equal(oceanStageForXP(stage.xp), index);
    if (index) { assert.ok(stage.xp > oceanEvolution[index - 1].xp); assert.equal(oceanStageForXP(stage.xp - 1), index - 1); }
  }
  const progress = saveAdventureGrowth(createAdventureProgress(), "fish", 11500, ["tree", "flower", "boat"], 20, Date.UTC(2026, 9, 5));
  assert.equal(progress.modes.fish.unlockedStages.length, 20);
  assert.deepEqual(validateAdventureProgress(progress), progress);
});

test("eighty card meanings cover plants, objects, actions and transport and preserve old teaching content", () => {
  assert.equal(adventureVocabulary.length, 80);
  assert.equal(new Set(adventureCardWordIds).size, 80);
  assert.deepEqual(new Set(adventureCardWordIds), new Set(adventureVocabulary.map(word => word.id)));
  const nearby = adventureCardWordIds.slice(0, 11).map(id => getAdventureWord(id)!.category);
  assert.equal(new Set(nearby).size, 11);
  for (const category of ["plants", "school", "home", "transport", "food", "animals", "toys"]) {
    assert.ok(adventureVocabulary.some(word => word.category === category));
  }
  for (const [index, word] of words.entries()) {
    const task = getAdventureTaskById(`snake-word-${word.id}`);
    assert.equal(task.promptEn, `Listen and find the ${word.en}.`);
    assert.deepEqual(task.options.map(option => option.id), [word.id, words[(index + 7) % 24].id, words[(index + 13) % 24].id]);
  }
  assert.equal(new Set([...getAdventureRound("snake", 0, 1), ...getAdventureRound("snake", 1, 1)]).size, 24);
  assert.equal(adventureTasks.filter(task => task.id.startsWith("snake-")).length, 80);
  assert.equal(getAdventureTaskById("snake-word-read").promptEn, "Find the picture for read.");
  assert.equal(snakeBreeds.length, 8);
  assert.equal(new Set(snakeBreeds.map(breed => breed.artIndex)).size, 8);
});
