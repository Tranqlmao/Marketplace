
import { execFileSync } from "node:child_process";
import { readdirSync, statSync, writeFileSync } from "node:fs";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

function stem(name) {
  const i = name.lastIndexOf(".");
  return i < 0 ? [name, ""] : [name.slice(0, i), name.slice(i + 1)];
}

// Pack ids become folder names, so keep them to safe characters.
const validId = (id) => id && id !== "." && id !== ".." && /^[\p{L}\p{N} ._\-+()[\]'&!,#@=~]+$/u.test(id);

// GitHub titles rename commits "Rename a.zip to b.zip".
function renamedTo(title) {
  const m = /^rename .+? to (.+)$/i.exec(title);
  if (!m) return null;
  return m[1].trim().replace(/\.zip$/i, "").trim();
}

function splitMessage(message) {
  const lines = message.split(/\r?\n/).map((l) => l.trim());
  const first = lines.shift() ?? "";
  return { title: renamedTo(first) ?? first, description: lines.filter(Boolean).join(" ") };
}

/** Messages of every commit that touched `file`, newest first, across renames. */
function history(file) {
  return git("log", "--follow", "--format=%B%x00", "--", file)
    .split("\0")
    .map((m) => m.trim())
    .filter(Boolean);
}

const files = readdirSync(".").filter((f) => statSync(f).isFile());
const packs = [];

for (const zip of files.filter((f) => stem(f)[1].toLowerCase() === "zip").sort((a, b) => a.localeCompare(b))) {
  const [id] = stem(zip);
  if (!validId(id)) {
    console.warn(`Skipping ${zip}: unsupported characters in the name`);
    continue;
  }
  // Same name, any image type; exact case first, then case-insensitive.
  const images = files.filter((f) => IMAGE_EXTENSIONS.includes(stem(f)[1].toLowerCase()));
  const image =
    images.find((f) => stem(f)[0] === id) ?? images.find((f) => stem(f)[0].toLowerCase() === id.toLowerCase());

  const messages = history(zip);
  let { title, description } = splitMessage(messages[0] ?? "");
  // A rename has no description: use the newest real commit's.
  if (!description) {
    const real = messages.find((m) => !renamedTo(m.split(/\r?\n/)[0].trim()));
    if (real) description = splitMessage(real).description;
  }

  packs.push({
    id,
    title: title || id,
    description,
    zip,
    image: image ?? null,
    // Git blob hash: the same value GitHub's API reports, so installed packs
    // still match after switching to packs.json.
    sha: git("hash-object", "--", zip).trim(),
    size: statSync(zip).size,
  });
}

writeFileSync("packs.json", JSON.stringify({ version: 1, packs }, null, 2) + "\n");
console.log(`packs.json: ${packs.length} pack(s)`);
