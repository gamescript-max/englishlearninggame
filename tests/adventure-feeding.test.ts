import test from "node:test";
import assert from "node:assert/strict";
import { feedingOpen, mouthGeometry, mouthProfile } from "../lib/adventure-feeding";
import { oceanEvolution } from "../lib/adventure-catalog";
import { naturalOceanArt } from "../lib/natural-ocean-art";
import { getOceanSpecies } from "../lib/adventure-catalog";
test("a bite opens and closes in simulation time, supports repeat bites, and honours reduced motion",()=>{
  assert.equal(feedingOpen(8),0);assert.equal(feedingOpen(8,9),0);
  assert.equal(feedingOpen(8,8),0);assert.ok(Math.abs(feedingOpen(8.1,8)-1)<1e-9);
  assert.equal(feedingOpen(8.43,8),0);assert.equal(feedingOpen(8.2,8.2),0);
  assert.ok(feedingOpen(8.05,8)<feedingOpen(8.1,8));
  assert.ok(feedingOpen(8.35,8)<feedingOpen(8.2,8));
  assert.equal(feedingOpen(8.16,8,true),0);
});
test("each real mouth seam separates visibly, closes exactly, and leaves the hinge in place",()=>{
  for (const stage of oceanEvolution) {
    const id=stage.speciesId, rect=naturalOceanArt(getOceanSpecies(id)!.artIndex),width=200,height=width*rect.h/rect.w;
    const closed=mouthGeometry(id,width,height,0),open=mouthGeometry(id,width,height,1);
    for (let i=0;i<closed.polygon.length;i++) {
      assert.ok(Math.abs(closed.polygon[i].x-closed.openedPolygon[i].x)<1e-9);
      assert.ok(Math.abs(closed.polygon[i].y-closed.openedPolygon[i].y)<1e-9);
    }
    assert.deepEqual(open.polygon[0],open.openedPolygon[0],`${id}: fixed mouth hinge`);
    assert.deepEqual(open.polygon[3],open.openedPolygon[3],`${id}: the entire neck edge is fixed`);
    assert.equal(open.lip.x,open.openedLip.x,`${id}: the lower lip stays attached horizontally`);
    assert.ok(open.openedLip.y-open.lip.y>width*.03*(mouthProfile(id).gapScale??1),`${id}: lips actually separate at a scale appropriate to the face`);
    assert.ok(open.openedLip.y-open.lip.y<width*.075,`${id}: bounded jaw opening`);
    assert.ok(mouthProfile(id).bottom<1,`${id}: lower fin is excluded`);
  }
  assert.ok(mouthProfile("swordfish").lip[0]<.86,"the swordfish's long bill stays outside the jaw mask");
});
