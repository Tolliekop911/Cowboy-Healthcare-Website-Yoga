#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Motion TV — ElevenLabs voiceover generator
   ───────────────────────────────────────────────────────────────────
   Turns the `script` of every guided-audio item in
   yoga/motion-tv/content.js (plus the breathwork voice cues) into
   narrated MP3s, and updates yoga/motion-tv/audio/manifest.json so the
   site starts showing them.

   Setup (once):
     1. Create a file named .env in the yoga-website folder containing:
          ELEVENLABS_API_KEY=your-key-here
          ELEVENLABS_VOICE_ID=voice-id-here
        (.env is git-ignored — the key never goes to GitHub or the site.)
     2. Find a voice ID:  node tools/elevenlabs-voiceovers.mjs --list-voices

   Usage:
     node tools/elevenlabs-voiceovers.mjs              generate anything missing
     node tools/elevenlabs-voiceovers.mjs --force      regenerate everything
     node tools/elevenlabs-voiceovers.mjs --only desk-reset
     node tools/elevenlabs-voiceovers.mjs --dry-run    show what would be generated

   Optional .env settings:
     ELEVENLABS_MODEL=eleven_multilingual_v2   (supports <break time="2s" /> pauses)
     ELEVENLABS_STABILITY=0.6   ELEVENLABS_SIMILARITY=0.75   ELEVENLABS_SPEED=0.92
     ELEVENLABS_API_BASE=https://api.elevenlabs.io/v1        (regional endpoint, if your plan uses one)
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const YOGA = join(ROOT, 'yoga');
const CONTENT = join(YOGA, 'motion-tv', 'content.js');
const MANIFEST = join(YOGA, 'motion-tv', 'audio', 'manifest.json');
const AUDIO_PREFIX = 'motion-tv/audio/';
const API = process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io/v1'; // override for regional endpoints
const MAX_CHARS = 9500; // model limit is 10,000 per request

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

function loadEnv() {
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function loadCatalog() {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(CONTENT, 'utf8'), sandbox, { filename: 'content.js' });
  if (!sandbox.window.MOTION_TV) throw new Error('content.js did not define window.MOTION_TV');
  return sandbox.window.MOTION_TV;
}

function jobsFrom(tv) {
  const jobs = [];
  for (const item of tv.items || []) {
    if (item.type === 'audio' && item.script && item.src) {
      jobs.push({ id: item.id, label: item.title, text: item.script, src: item.src });
    }
  }
  for (const [phase, cue] of Object.entries(tv.voiceCues || {})) {
    if (cue && cue.text && cue.src) jobs.push({ id: 'cue-' + phase, label: 'Voice cue: ' + phase, text: cue.text, src: cue.src });
  }
  return jobs;
}

function cleanScript(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('\n');
}

async function api(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, ...(init.headers || {}) }
  });
  if (!res.ok) {
    let detail = '';
    try { const body = await res.json(); detail = body.detail?.message || body.detail?.status || JSON.stringify(body.detail || body); }
    catch { detail = await res.text().catch(() => ''); }
    throw new Error(`ElevenLabs ${res.status} ${res.statusText}${detail ? ': ' + detail : ''}`);
  }
  return res;
}

async function listVoices() {
  const res = await api('/voices');
  const { voices = [] } = await res.json();
  if (!voices.length) { console.log('No voices on this account yet. Add one in the ElevenLabs Voice Library.'); return; }
  console.log('\nVoices on your ElevenLabs account:\n');
  for (const v of voices) {
    const tags = [v.category, v.labels?.gender, v.labels?.accent, v.labels?.description].filter(Boolean).join(', ');
    console.log(`  ${v.voice_id}   ${v.name}${tags ? '  (' + tags + ')' : ''}`);
  }
  console.log('\nPut the one you like in .env as ELEVENLABS_VOICE_ID=<id>\n');
}

async function synthesize(text) {
  const settings = {
    stability: Number(process.env.ELEVENLABS_STABILITY ?? 0.6),
    similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY ?? 0.75)
  };
  if (process.env.ELEVENLABS_SPEED) settings.speed = Number(process.env.ELEVENLABS_SPEED);
  const voice = encodeURIComponent(process.env.ELEVENLABS_VOICE_ID);
  const res = await api(`/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
      voice_settings: settings
    })
  });
  return Buffer.from(await res.arrayBuffer());
}

function writeManifest(jobs) {
  const files = jobs.map((j) => j.src).filter((src) => src.startsWith(AUDIO_PREFIX) && existsSync(join(YOGA, src)));
  const note = 'Generated by tools/elevenlabs-voiceovers.mjs. Lists the narrated audio files that exist, so Motion TV only shows sessions that are ready.';
  writeFileSync(MANIFEST, JSON.stringify({ note, files: [...new Set(files)].sort() }, null, 2) + '\n');
  return files.length;
}

async function main() {
  loadEnv();
  const needKey = () => {
    if (!process.env.ELEVENLABS_API_KEY) {
      console.error('Missing ELEVENLABS_API_KEY. Add it to a .env file in the yoga-website folder (see top of this script).');
      process.exit(1);
    }
  };

  if (flag('--list-voices')) { needKey(); await listVoices(); return; }

  const jobs = jobsFrom(loadCatalog());
  const only = option('--only');
  const selected = jobs.filter((j) => !only || j.id === only || j.id === 'cue-' + only);
  if (only && !selected.length) { console.error(`No audio item or cue with id "${only}".`); process.exit(1); }

  const todo = selected.filter((j) => flag('--force') || !existsSync(join(YOGA, j.src)));
  const chars = todo.reduce((n, j) => n + cleanScript(j.text).length, 0);
  console.log(`${todo.length} of ${selected.length} voiceovers to generate (${chars.toLocaleString()} characters of your ElevenLabs quota).`);

  if (flag('--dry-run')) {
    for (const j of todo) console.log(`  • ${j.label}  →  yoga/${j.src}`);
    return;
  }
  if (todo.length) {
    needKey();
    if (!process.env.ELEVENLABS_VOICE_ID) {
      console.error('Missing ELEVENLABS_VOICE_ID. Run with --list-voices to pick one, then add it to .env.');
      process.exit(1);
    }
  }

  let failed = 0;
  for (const job of todo) {
    const text = cleanScript(job.text);
    if (text.length > MAX_CHARS) { console.error(`  ✗ ${job.label}: script is ${text.length} characters (max ${MAX_CHARS}). Split it into two sessions.`); failed++; continue; }
    process.stdout.write(`  … ${job.label}`);
    try {
      const mp3 = await synthesize(text);
      const out = join(YOGA, job.src);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, mp3);
      console.log(`\r  ✓ ${job.label}  (${(mp3.length / 1024).toFixed(0)} KB → yoga/${job.src})`);
    } catch (err) {
      console.log(`\r  ✗ ${job.label}: ${err.message}`);
      failed++;
    }
  }

  const listed = writeManifest(jobs);
  console.log(`\nmanifest.json now lists ${listed} audio file${listed === 1 ? '' : 's'}.` +
    (failed ? `  ${failed} failed — see messages above.` : '  Motion TV will show them on next page load.'));
  if (failed) process.exit(1);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
