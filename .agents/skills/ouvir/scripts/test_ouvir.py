#!/usr/bin/env python3
"""Tests for ouvir. Every audio file is generated here: tones, clicks, silence and a short chord progression.

    python scripts/test_ouvir.py                 plain-words errors, plus the analysis tests when an engine exists
    OUVIR_HOME=<folder> python scripts/test_ouvir.py   use the engine installed in that folder (ouvir_setup.py --install)

Tests that need the engine or the listening models skip themselves, and say why, when those are not installed.
"""
from __future__ import annotations

import json
import math
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
import wave
from argparse import Namespace
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ouvir_setup as setup  # noqa: E402

FFMPEG = shutil.which('ffmpeg')
SR = 22050


def write_wav(path, samples, rate=SR, channels=1):
    peak = max(1e-9, max(abs(s) for s in samples))
    scale = 32767 if peak <= 1 else 32767 / peak
    with wave.open(str(path), 'wb') as out:
        out.setnchannels(channels)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(b''.join(struct.pack('<h', int(round(s * scale))) for s in samples))


def tone_with_silence(rate=44100):
    """1 s of silence, 2 s of a 1 kHz sine at 0.1 (-20 dBFS), 1 s of silence."""
    return [0.1 * math.sin(2 * math.pi * 1000 * i / rate) if rate <= i < 3 * rate else 0.0 for i in range(4 * rate)]


def clicks(times, seconds=6):
    out = [0.0] * (SR * seconds)
    for t in times:
        start = int(t * SR)
        for k in range(int(0.05 * SR)):
            out[start + k] += 0.5 * math.sin(2 * math.pi * 2000 * k / SR) * math.exp(-k / (0.008 * SR))
    return out


def midi_hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def progression(seconds=12, bpm=120):
    """C F G C chords, struck on every beat: C major at 120 BPM by construction."""
    chords = [(60, 64, 67), (65, 69, 72), (67, 71, 74), (60, 64, 67)]
    beat = 60 / bpm
    out = [0.0] * (SR * seconds)
    for n in range(int(seconds / beat)):
        chord = chords[int(n * beat // (4 * beat)) % 4]
        start = int(n * beat * SR)
        for k in range(min(int(beat * SR), len(out) - start)):
            tt = k / SR
            env = math.exp(-5 * tt)
            value = sum(math.sin(2 * math.pi * midi_hz(m) * tt) + 0.4 * math.sin(4 * math.pi * midi_hz(m) * tt)
                        for m in chord)
            out[start + k] += 0.12 * env * value + 0.25 * env * math.sin(2 * math.pi * midi_hz(chord[0] - 24) * tt)
    return out


def run(*args, home=None, path=None, extra_env=None):
    env = dict(os.environ, PYTHONUTF8='1')
    if home is not None:
        env['OUVIR_HOME'] = str(home)
    if path is not None:
        env['PATH'] = str(path)
    env.update(extra_env or {})
    done = subprocess.run([sys.executable, str(HERE / 'ouvir.py'), *map(str, args)], env=env, capture_output=True,
                          text=True, encoding='utf-8')
    try:
        return done.returncode, json.loads(done.stdout)
    except ValueError:
        raise AssertionError(f'not JSON (exit {done.returncode}):\n{done.stdout}\n{done.stderr}') from None


def ebur128(path):
    """The independent reading: ffmpeg's EBU R128 meter."""
    log = subprocess.run([FFMPEG, '-hide_banner', '-nostats', '-i', str(path), '-af', 'ebur128=peak=true',
                          '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.search(r'I:\s+(-?[\d.]+) LUFS', log.split('Summary:')[-1]).group(1))


class PlainWordsErrors(unittest.TestCase):
    """No engine, no ffmpeg, no watch: every failure is a sentence with a fix, never a stack trace."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix='ouvir-test-'))
        write_wav(self.tmp / 'x.wav', [0.1 * math.sin(i / 10) for i in range(SR)])

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    @unittest.skipUnless(FFMPEG, 'ffmpeg is needed to start the launcher checks')
    def test_missing_engine(self):
        code, out = run('measure', self.tmp / 'x.wav', home=self.tmp / 'nothing')
        self.assertEqual((code, out['ok']), (2, False))
        self.assertIn('not installed', out['error'])
        self.assertIn('ouvir_setup.py --install --yes', out['fix'])

    def test_missing_ffmpeg(self):
        empty = self.tmp / 'empty-path'
        empty.mkdir()
        code, out = run('measure', self.tmp / 'x.wav', home=self.tmp / 'nothing', path=empty)
        self.assertEqual((code, out['ok']), (2, False))
        self.assertIn('ffmpeg', out['error'])
        self.assertTrue(out['fix'])

    @unittest.skipUnless(FFMPEG, 'ffmpeg is needed to start the launcher checks')
    def test_missing_file(self):
        code, out = run('measure', self.tmp / 'nope.wav', home=self.tmp / 'nothing')
        self.assertEqual((code, out['ok']), (1, False))
        self.assertIn('no file', out['error'])

    @unittest.skipUnless(FFMPEG, 'ffmpeg is needed to start the launcher checks')
    def test_opinion_needs_consent(self):
        code, out = run('opinion', self.tmp / 'x.wav', home=self.tmp / 'nothing')
        self.assertEqual((code, out['ok']), (3, False))
        self.assertIn('agree', out['error'])

    @unittest.skipUnless(FFMPEG, 'ffmpeg is needed to start the launcher checks')
    def test_speech_without_a_backend(self):
        fake_home = self.tmp / 'home'
        fake_home.mkdir()
        code, out = run('speech', self.tmp / 'x.wav', home=self.tmp / 'nothing',
                        extra_env={'USERPROFILE': str(fake_home), 'HOME': str(fake_home),
                                   'GROQ_API_KEY': '', 'OPENAI_API_KEY': ''})
        self.assertEqual((code, out['ok']), (2, False))
        self.assertIn('watch', out['fix'])

    def test_install_asks_first(self):
        done = subprocess.run([sys.executable, str(HERE / 'ouvir_setup.py'), '--install'], capture_output=True,
                              text=True, env=dict(os.environ, OUVIR_HOME=str(self.tmp / 'nothing')))
        self.assertEqual(done.returncode, 3)
        self.assertIn('Ask the person', done.stderr)
        self.assertFalse((self.tmp / 'nothing').exists())


class SpeechPlumbing(unittest.TestCase):
    """The transcription backends belong to the watch skill; here they are stubbed to test what ouvir adds."""

    @unittest.skipUnless(FFMPEG, 'ffmpeg is needed to start the launcher checks')
    def test_segments_are_filtered_and_labelled(self):
        import ouvir
        tmp = Path(tempfile.mkdtemp(prefix='ouvir-test-'))
        try:
            write_wav(tmp / 'x.wav', [0.1 * math.sin(i / 10) for i in range(SR)])
            segments = [{'start': 0.0, 'end': 1.0, 'text': 'one'}, {'start': 5.0, 'end': 6.0, 'text': 'two'}]
            fake = {'config': SimpleNamespace(get_config=lambda: {'whisper_backend': 'groq'}),
                    'whisper': SimpleNamespace(transcribe_video=lambda path, out, backend=None: (segments, 'groq')),
                    'transcribe': SimpleNamespace(filter_range=lambda segs, a, b: [
                        s for s in segs if (a is None or s['end'] >= a) and (b is None or s['start'] <= b)])}
            out = StringIO()
            with mock.patch.object(setup, 'import_watch', lambda name: fake[name]), redirect_stdout(out):
                code = ouvir.speech(Namespace(file=str(tmp / 'x.wav'), backend=None, start=2.0, end=None))
            result = json.loads(out.getvalue())
            self.assertEqual(code, 0)
            self.assertEqual([s['text'] for s in result['segments']], ['two'])
            self.assertTrue(result['audio_left_the_machine'])
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


@unittest.skipUnless(FFMPEG and setup.engine_ready(), 'the measuring engine is not installed (OUVIR_HOME)')
class Analysis(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix='ouvir-test-'))
        write_wav(cls.tmp / 'tone.wav', tone_with_silence(), rate=44100)
        write_wav(cls.tmp / 'tone-quiet.wav', [s / 2 for s in tone_with_silence()], rate=44100)
        write_wav(cls.tmp / 'clicks.wav', clicks([0.5, 1.2, 2.0, 3.1, 4.4]))
        write_wav(cls.tmp / 'c-major-120.wav', progression())
        write_wav(cls.tmp / 'a4.wav', [0.3 * math.exp(-3 * i / SR) * math.sin(2 * math.pi * 440 * i / SR)
                                       for i in range(SR)])
        subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', str(cls.tmp / 'tone.wav'), '-ac', '2',
                        str(cls.tmp / 'tone-stereo.wav')], check=True)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def ok(self, *args):
        code, out = run(*args)
        self.assertEqual((code, out.get('ok')), (0, True), out)
        return out

    def test_measure_loudness_peak_and_silence(self):
        out = self.ok('measure', self.tmp / 'tone.wav')
        self.assertEqual(out['sample_rate_hz'], 44100)
        self.assertAlmostEqual(out['duration_s'], 4.0, delta=0.01)
        self.assertAlmostEqual(out['peak_dbfs'], -20.0, delta=0.1)
        self.assertAlmostEqual(out['true_peak_dbtp'], -20.0, delta=0.3)
        self.assertAlmostEqual(out['integrated_lufs'], ebur128(self.tmp / 'tone.wav'), delta=0.3)
        self.assertAlmostEqual(out['silence']['start_s'], 1.0, delta=0.02)
        self.assertAlmostEqual(out['silence']['end_s'], 1.0, delta=0.02)
        self.assertIsNone(out['dynamic_range_db'])  # digital silence: no noise floor to compare against

    def test_measure_stereo_matches_the_meter(self):
        out = self.ok('measure', self.tmp / 'tone-stereo.wav')
        self.assertAlmostEqual(out['integrated_lufs'], ebur128(self.tmp / 'tone-stereo.wav'), delta=0.3)

    def test_compare_two_files(self):
        out = self.ok('compare', self.tmp / 'tone.wav', self.tmp / 'tone-quiet.wav')
        self.assertAlmostEqual(out['difference_b_minus_a']['integrated_lufs'], -6.0, delta=0.3)
        self.assertTrue(any('quieter' in line for line in out['in_words']))

    def test_events_at_the_known_times(self):
        out = self.ok('events', self.tmp / 'clicks.wav')
        times = [e['t'] for e in out['events'] if not e['at_file_start']]
        self.assertEqual(len(times), 5, times)
        for found, known in zip(times, [0.5, 1.2, 2.0, 3.1, 4.4]):
            self.assertAlmostEqual(found, known, delta=0.005)

    def test_cue_sheet_hit_and_miss(self):
        sheet = self.tmp / 'cues.json'
        sheet.write_text(json.dumps({'cues': [
            {'time': 0.5, 'label': 'exact'}, {'time': 2.03, 'label': 'within tolerance'},
            {'time': 2.6, 'label': 'no sound here'}, {'time': 4.5, 'label': 'too late', 'tolerance_ms': 20},
            {'frame': 93, 'label': 'by frame'}]}), encoding='utf-8')  # 93 / 30 fps = 3.1 s
        out = self.ok('events', self.tmp / 'clicks.wav', '--cues', sheet, '--fps', 30)
        check = out['cue_check']
        status = {row['label']: row['status'] for row in check['cues']}
        self.assertEqual(status, {'exact': 'hit', 'within tolerance': 'hit', 'no sound here': 'miss',
                                  'too late': 'miss', 'by frame': 'hit'})
        self.assertEqual((check['hits'], check['misses']), (3, 2))
        self.assertEqual(sorted(check['missing']), ['no sound here', 'too late'])
        late = next(r for r in check['cues'] if r['label'] == 'too late')
        self.assertAlmostEqual(late['nearest_offset_ms'], -100.0, delta=10)
        self.assertIn('chance_hit_rate', check)

    def test_key_and_tempo_on_a_known_progression(self):
        out = self.ok('key', self.tmp / 'c-major-120.wav')
        self.assertEqual(out['key']['best'], 'C major')
        self.assertTrue(out['key']['reliable'])
        self.assertAlmostEqual(out['tempo']['bpm'], 120.0, delta=2.0)
        self.assertEqual(out['tempo']['confidence'], 'clear')

    def test_key_says_when_it_cannot_tell(self):
        out = self.ok('key', self.tmp / 'a4.wav')
        self.assertFalse(out['key']['reliable'])
        self.assertTrue(out['key']['why_not_reliable'])
        self.assertEqual(out['pitch']['note'], 'A4')
        self.assertIsNone(out['tempo']['bpm'])

    def test_corrupt_file_is_a_sentence(self):
        bad = self.tmp / 'bad.wav'
        bad.write_bytes(b'this is not audio')
        code, out = run('measure', bad)
        self.assertEqual((code, out['ok']), (1, False))
        self.assertTrue(out['error'])


@unittest.skipUnless(FFMPEG and setup.models_ready(), 'the listening models are not installed')
class ListeningModels(unittest.TestCase):
    def test_describe_find_and_match(self):
        tmp = Path(tempfile.mkdtemp(prefix='ouvir-test-'))
        try:
            write_wav(tmp / 'clicks.wav', clicks([0.5, 1.2, 2.0, 3.1, 4.4]))
            code, out = run('describe', tmp / 'clicks.wav')
            self.assertEqual((code, out['ok']), (0, True), out)
            self.assertIn('overall', out)
            code, out = run('find', tmp / 'clicks.wav', 'a short click', '--top', 2)
            self.assertEqual((code, out['ok']), (0, True), out)
            code, out = run('compare', tmp / 'clicks.wav', '--text', 'a computer-generated electronic tone')
            self.assertEqual((code, out['ok']), (0, True), out)
            self.assertIn(out['result']['verdict'], ('strong', 'plausible'))
            write_wav(tmp / 'quiet.wav', [s / 3 for s in clicks([0.5, 1.2, 2.0, 3.1, 4.4])])
            code, out = run('compare', tmp / 'clicks.wav', tmp / 'quiet.wav')
            self.assertEqual((code, out['ok']), (0, True), out)
            self.assertIsNotNone(out['listening_model'])
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
