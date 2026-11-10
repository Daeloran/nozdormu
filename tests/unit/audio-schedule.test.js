import { test } from "node:test";
import assert from "node:assert/strict";

// Faux Web Audio : enregistre start/stop de chaque source.
const sources = [];
class FakeNode {
  connect(node) {
    return node ?? this;
  }
}
class FakeSource extends FakeNode {
  constructor(kind) {
    super();
    this.kind = kind;
    this.frequency = { value: 0 };
    this.stopped = [];
    sources.push(this);
  }
  start(at = 0) {
    this.startedAt = at;
  }
  stop(at = "now") {
    this.stopped.push(at);
  }
}
class FakeContext {
  constructor() {
    this.state = "running";
    this.currentTime = 100;
    this.destination = new FakeNode();
  }
  resume() {}
  createOscillator() {
    return new FakeSource("osc");
  }
  createBufferSource() {
    return new FakeSource("buffer");
  }
  createBuffer(channels, length) {
    return { length };
  }
  createGain() {
    const node = new FakeNode();
    node.gain = { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    return node;
  }
  decodeAudioData(data, resolve) {
    resolve({ clip: data.name });
  }
}

const session = {};
globalThis.window = { AudioContext: FakeContext };
Object.defineProperty(globalThis, "navigator", { value: { audioSession: session }, configurable: true });
globalThis.fetch = async (url) => ({ arrayBuffer: async () => ({ name: url }) });

const { unlock, schedule, cancel, audioTime } = await import("../../src/audio.js");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const clipSources = () => sources.filter((s) => s.buffer?.clip);

test("unlock : session playback si arrière-plan, ambient sinon", () => {
  unlock(false);
  assert.equal(session.type, "ambient");
  unlock(true);
  assert.equal(session.type, "playback");
  assert.equal(audioTime(), 100);
});

test("schedule : chaque son à origin + at, annonce coupée par la suivante, boucle muette arrêtée après le dernier son", async () => {
  await flush();
  sources.length = 0;
  schedule(
    [
      { at: 0, sound: "long" },
      { at: 0.35, sound: "voice", text: "Préparation" },
      { at: 7, sound: "short" },
      { at: 10, sound: "long" },
      { at: 10.35, sound: "voice", text: "Exercice" },
    ],
    100,
  );
  await flush();
  const oscs = sources.filter((s) => s.kind === "osc");
  assert.deepEqual(
    oscs.map((s) => s.startedAt),
    [100, 107, 110],
  );
  const voices = clipSources();
  assert.deepEqual(
    voices.map((s) => [s.buffer.clip, s.startedAt, s.stopped]),
    [
      ["audio/preparation.mp3", 100.35, [110.35]],
      ["audio/exercice.mp3", 110.35, []],
    ],
  );
  const keepAlive = sources.find((s) => s.loop);
  assert.ok(keepAlive, "boucle muette absente");
  assert.deepEqual(keepAlive.stopped, [110.35 + 3]);
});

test("cancel arrête tout ce qui est programmé", async () => {
  sources.length = 0;
  schedule([{ at: 5, sound: "end" }, { at: 6.4, sound: "voice", text: "Séance terminée" }], 100);
  await flush();
  cancel();
  for (const s of sources) assert.ok(s.stopped.includes("now"), `${s.kind} non arrêté`);
});

test("annonce déjà trop en retard (> 1 s) : non jouée", async () => {
  sources.length = 0;
  schedule([{ at: 0, sound: "voice", text: "Repos" }], 98); // prévue à 98, contexte à 100
  await flush();
  assert.equal(clipSources().length, 0);
});

test("schedule remplace la programmation précédente", async () => {
  sources.length = 0;
  schedule([{ at: 1, sound: "short" }], 100);
  const first = sources.filter((s) => s.kind === "osc");
  schedule([{ at: 2, sound: "short" }], 100);
  for (const s of first) assert.ok(s.stopped.includes("now"));
});

test("bip déjà échu (instant audio négatif ou passé) : joué tout de suite, sans instant négatif", () => {
  sources.length = 0;
  schedule([{ at: 0, sound: "long" }], -0.0006);
  const [osc] = sources.filter((s) => s.kind === "osc");
  assert.equal(osc.startedAt, 100);
});

test("unlock fresh : arrête les sons programmés sur l'ancien contexte", async () => {
  unlock(true);
  schedule([{ at: 5, sound: "long" }], 100);
  const before = sources.filter((s) => s.kind === "osc");
  assert.ok(before.length > 0);
  unlock(true, { fresh: true });
  for (const s of before) assert.ok(s.stopped.includes("now"), "son de l'ancien contexte non arrêté");
});

test("unlock fresh : tolère un close() absent, qui lève ou qui rejette (anciens Safari)", async () => {
  const variants = [
    undefined,
    () => {
      throw new Error("close");
    },
    () => Promise.reject(new Error("close")),
  ];
  for (const close of variants) {
    FakeContext.prototype.close = close;
    assert.doesNotThrow(() => unlock(false, { fresh: true }));
    await flush();
    assert.equal(audioTime(), 100, "le nouveau contexte doit être utilisable");
  }
  delete FakeContext.prototype.close;
});
