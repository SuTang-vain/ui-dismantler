import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { comparePixels, cropPng } from "../evaluation/browser.js";

function solidPng(width: number, height: number, rgba: [number, number, number, number]): PNG {
  const png = new PNG({ width, height });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = rgba[0]; png.data[index + 1] = rgba[1]; png.data[index + 2] = rgba[2]; png.data[index + 3] = rgba[3];
  }
  return png;
}

test("cropPng extracts the exact rect and clamps to image bounds", () => {
  const image = solidPng(100, 80, [255, 0, 0, 255]);
  const crop = cropPng(image, { x: 10, y: 20, width: 30, height: 25 });
  assert.equal(crop.width, 30);
  assert.equal(crop.height, 25);
  // 越界裁剪被钳制到图像内，不抛错、不越界读。
  const clamped = cropPng(image, { x: 90, y: 70, width: 50, height: 50 });
  assert.equal(clamped.width, 10);
  assert.equal(clamped.height, 10);
});

test("cropped regions of identical pixels diff at zero and different pixels diff at one", async () => {
  const red = solidPng(40, 40, [255, 0, 0, 255]);
  const blue = solidPng(40, 40, [0, 0, 255, 255]);
  const redCrop = PNG.sync.write(cropPng(red, { x: 5, y: 5, width: 20, height: 20 }));
  const redAgain = PNG.sync.write(cropPng(red, { x: 10, y: 10, width: 20, height: 20 }));
  const blueCrop = PNG.sync.write(cropPng(blue, { x: 5, y: 5, width: 20, height: 20 }));
  const same = await comparePixels(redCrop, redAgain, 0.02);
  const different = await comparePixels(redCrop, blueCrop, 0.02);
  assert.equal(same.diffRate, 0);
  assert.equal(different.diffRate > 0.9, true, `expected near-total diff, received ${different.diffRate}`);
});
