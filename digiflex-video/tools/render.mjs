// Rendu image par image de index.html (Playwright + Chromium) puis encodage ffmpeg.
//   node tools/render.mjs                    -> out/digiflex-canard.mp4 (vidéo muette) + audio/cues.json
//   node tools/render.mjs --stills 2,5.5,12  -> out/stills/*.png (contrôle visuel)
//   node tools/render.mjs --from 10 --to 15  -> extrait
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const browser = await chromium.launch({ args: ["--allow-file-access-from-files", "--force-color-profile=srgb", "--hide-scrollbars"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") console.log("[page]", m.text()); });
page.on("pageerror", (e) => { console.error("[page error]", e.message); process.exitCode = 1; });
await page.goto(pathToFileURL(join(ROOT, "index.html")).href + "?render");
await page.waitForFunction(() => window.READY === true);
const info = await page.evaluate(() => window.cues());
const fps = 30;

if (args.includes("--stills")) {
  const times = opt("--stills", "0").split(",").map(Number);
  mkdirSync(join(ROOT, "out", "stills"), { recursive: true });
  for (const t of times) {
    await page.evaluate((t) => window.renderAt(t), t);
    const f = join(ROOT, "out", "stills", `t${t.toFixed(2).padStart(6, "0")}.png`);
    await page.screenshot({ path: f });
    console.log(f);
  }
} else {
  mkdirSync(join(ROOT, "audio"), { recursive: true });
  writeFileSync(join(ROOT, "audio", "cues.json"), JSON.stringify(info, null, 1));
  const from = +opt("--from", 0), to = +opt("--to", info.total);
  const out = opt("--out", join(ROOT, "out", "video.mp4"));
  mkdirSync(dirname(out), { recursive: true });
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
  const n0 = Math.round(from * fps), n1 = Math.round(to * fps);
  const t0 = Date.now();
  for (let n = n0; n < n1; n++) {
    await page.evaluate((t) => window.renderAt(t), n / fps);
    const buf = await page.screenshot({ type: "jpeg", quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if ((n - n0) % 150 === 0) console.log(`image ${n - n0}/${n1 - n0}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log("vidéo :", out);
}
await browser.close();
