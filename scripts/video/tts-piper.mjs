/**
 * Minimal Piper TTS runner (used for Czech, which Kokoro does not speak).
 * espeak-ng (brew install espeak-ng) turns text into IPA phonemes, the Piper ONNX
 * voice turns phoneme ids into audio. Piper's own macOS binary ships broken, and
 * the Python package needs PyPI downloads, so this replaces both.
 */
import ort from 'onnxruntime-node';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const VOICES_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';
const sessions = new Map();

/** Download e.g. cs_CZ-jirka-medium into `dir` once; returns the .onnx path. */
async function ensureModel(name, dir) {
    const [locale, speaker, quality] = name.split('-');
    const onnx = path.join(dir, `${name}.onnx`);
    for (const file of [onnx, `${onnx}.json`]) {
        if (fs.existsSync(file)) continue;
        const url = `${VOICES_URL}/${locale.split('_')[0]}/${locale}/${speaker}/${quality}/${path.basename(file)}`;
        console.log(`  downloading ${url}`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`piper: ${res.status} for ${url}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }
    return onnx;
}

function phonemeIds(text, cfg) {
    const map = cfg.phoneme_id_map;
    const ids = [...map['^'], ...map['_']];
    // espeak drops punctuation, but Piper uses it for pauses: phonemize clause by clause
    // and re-append each clause's terminator.
    for (const [, clause, punct] of text.matchAll(/([^,.;:!?]+)([,.;:!?]?)/g)) {
        if (!clause.trim()) continue;
        const ipa = execFileSync('espeak-ng', ['-v', cfg.espeak.voice, '-q', '--ipa'], { input: clause })
            .toString().trim().replace(/\s+/g, ' ');
        for (const ch of [...ipa, ...punct, ' ']) if (map[ch]) ids.push(...map[ch], ...map['_']);
    }
    ids.push(...map['$']);
    return ids;
}

/** Returns { samples: Float32Array, sampleRate }. */
export async function piperSpeak(text, voice, modelDir) {
    const onnx = await ensureModel(voice, modelDir);
    const cfg = JSON.parse(fs.readFileSync(`${onnx}.json`, 'utf8'));
    const ids = phonemeIds(text, cfg);
    if (!sessions.has(onnx)) sessions.set(onnx, await ort.InferenceSession.create(onnx));
    const session = sessions.get(onnx);
    const { noise_scale = 0.667, length_scale = 1, noise_w = 0.8 } = cfg.inference ?? {};
    const out = await session.run({
        input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
        input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
        scales: new ort.Tensor('float32', Float32Array.from([noise_scale, length_scale, noise_w]), [3]),
    });
    return { samples: out[session.outputNames[0]].data, sampleRate: cfg.audio.sample_rate };
}

/** 16-bit PCM mono WAV. */
export function writeWav(file, samples, sampleRate) {
    const pcm = Buffer.alloc(samples.length * 2);
    samples.forEach((s, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
    const header = Buffer.alloc(44);
    header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
    header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(file, Buffer.concat([header, pcm]));
}
