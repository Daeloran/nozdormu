import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Tests d'intention de l'issue #10 : chaque « Lancer » repart d'un contexte audio neuf (option `fresh` de unlock).

// ---------- faux environnement audio ----------

// Méthodes ou propriétés inconnues : no-op tolérant (le détail de la synthèse n'est pas spécifié).
function permissive(base) {
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === "symbol" || prop === "then") return undefined;
      return () => {};
    },
  });
}

function makeParam() {
  return permissive({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
    cancelScheduledValues() {},
  });
}

function makeNode(ctx, kind) {
  ctx.nodes.push(kind);
  return permissive({
    kind,
    context: ctx,
    buffer: null,
    loop: false,
    onended: null,
    frequency: makeParam(),
    detune: makeParam(),
    gain: makeParam(),
    connect(target) {
      return target;
    },
    disconnect() {},
    start() {},
    stop() {},
  });
}

function makeBuffer(channels = 1, length = 1, sampleRate = 22050) {
  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: () => new Float32Array(length),
  };
}

class FakeAudioContext {
  static instances = [];

  constructor() {
    this.state = "running";
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = { kind: "destination" };
    this.nodes = [];
    this.closed = false;
    this.closeCalls = 0;
    FakeAudioContext.instances.push(this);
  }

  resume() {
    if (this.state !== "closed") this.state = "running";
    return Promise.resolve();
  }

  close() {
    this.closeCalls++;
    this.closed = true;
    this.state = "closed";
    return Promise.resolve();
  }

  createBufferSource() {
    return makeNode(this, "bufferSource");
  }

  createOscillator() {
    return makeNode(this, "oscillator");
  }

  createGain() {
    return makeNode(this, "gain");
  }

  createBuffer(channels, length, sampleRate) {
    this.nodes.push("buffer");
    return makeBuffer(channels, length, sampleRate);
  }

  decodeAudioData(data, ok) {
    const buffer = makeBuffer(1, 22050, 22050);
    if (typeof ok === "function") ok(buffer);
    return Promise.resolve(buffer);
  }
}

let fetchCalls = [];
let moduleCounter = 0;

function installGlobals() {
  FakeAudioContext.instances = [];
  fetchCalls = [];
  globalThis.window = { AudioContext: FakeAudioContext };
  Object.defineProperty(globalThis, "navigator", { value: { audioSession: {} }, configurable: true });
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
  };
}

// Instance de module fraîche à chaque test : l'état audio interne repart de zéro.
async function freshAudio() {
  moduleCounter++;
  return import(`../../src/audio.js?n=${moduleCounter}`);
}

// Laisse se dérouler promesses et callbacks (décodage, resume, close…).
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

const PLAN = [
  { at: 0, sound: "long" },
  { at: 0.35, sound: "voice", text: "Préparation" },
  { at: 7, sound: "short" },
  { at: 8, sound: "short" },
  { at: 9, sound: "short" },
  { at: 10, sound: "end" },
  { at: 11.4, sound: "voice", text: "Séance terminée" },
];

// Premier unlock puis unlock avec fresh ; renvoie [ancien contexte, nouveau contexte].
async function unlockThenFresh(audio) {
  await audio.unlock(false);
  await settle();
  assert.equal(FakeAudioContext.instances.length, 1, "le premier unlock doit créer un contexte audio");
  await audio.unlock(false, { fresh: true });
  await settle();
  const [oldCtx, newCtx] = FakeAudioContext.instances;
  assert.equal(FakeAudioContext.instances.length, 2, "unlock avec { fresh: true } doit créer un nouveau contexte");
  return [oldCtx, newCtx];
}

beforeEach(() => {
  installGlobals();
});

// ---------- tests ----------

test("unlock répété sans fresh → une seule instance d'AudioContext, jamais fermée", async () => {
  const audio = await freshAudio();
  for (const background of [false, true, false, true]) {
    await audio.unlock(background);
    await settle();
  }
  assert.equal(FakeAudioContext.instances.length, 1, "unlock sans fresh doit réutiliser le contexte existant");
  assert.equal(FakeAudioContext.instances[0].closeCalls, 0, "unlock sans fresh ne doit pas fermer le contexte");
});

test("unlock(x, { fresh: true }) après un premier unlock → nouvelle instance, l'ancienne a reçu close()", async () => {
  const audio = await freshAudio();
  const [oldCtx, newCtx] = await unlockThenFresh(audio);
  assert.notEqual(newCtx, oldCtx, "le nouveau contexte doit être une instance distincte");
  assert.ok(oldCtx.closeCalls >= 1, "l'ancien contexte doit avoir reçu close()");
  assert.equal(newCtx.closeCalls, 0, "le nouveau contexte ne doit pas être fermé");
});

test("schedule() après le fresh → nœuds créés sur la nouvelle instance, aucun sur l'ancienne", async () => {
  const audio = await freshAudio();
  const [oldCtx, newCtx] = await unlockThenFresh(audio);
  const oldBefore = oldCtx.nodes.length;
  const newBefore = newCtx.nodes.length;
  newCtx.currentTime = 3;
  audio.schedule(PLAN, 3);
  await settle();
  assert.ok(newCtx.nodes.length > newBefore, "schedule doit créer des nœuds sur le nouveau contexte");
  assert.equal(
    oldCtx.nodes.length,
    oldBefore,
    `schedule ne doit créer aucun nœud sur l'ancien contexte (créés : ${oldCtx.nodes.slice(oldBefore).join(", ")})`,
  );
});

test("audioTime() après le fresh → currentTime de la nouvelle instance", async () => {
  const audio = await freshAudio();
  const [oldCtx, newCtx] = await unlockThenFresh(audio);
  oldCtx.currentTime = 111;
  newCtx.currentTime = 7.5;
  assert.equal(audio.audioTime(), 7.5, "audioTime doit lire l'horloge du nouveau contexte");
  newCtx.currentTime = 9.25;
  assert.equal(audio.audioTime(), 9.25, "audioTime doit suivre l'horloge du nouveau contexte");
});

test("pas de nouveau fetch des clips voix lors d'un fresh", async () => {
  const audio = await freshAudio();
  await audio.unlock(false);
  await settle();
  const afterFirst = fetchCalls.length;
  assert.ok(afterFirst > 0, "le premier unlock doit charger les clips voix");
  await audio.unlock(false, { fresh: true });
  await settle();
  assert.equal(FakeAudioContext.instances.length, 2, "unlock avec { fresh: true } doit créer un nouveau contexte");
  assert.equal(
    fetchCalls.length,
    afterFirst,
    `fresh ne doit pas retélécharger les clips (nouveaux fetch : ${fetchCalls.slice(afterFirst).join(", ")})`,
  );
});
