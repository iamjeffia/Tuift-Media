#!/usr/bin/env python3
"""The analysis half of ouvir. It runs inside the skill's own virtual environment (see ouvir_setup.py) and uses
earshot (MIT, https://github.com/Leonxlnx/earshot) for decoding, loudness, onsets, tempo and the listening models.
Prints one JSON object on stdout; progress and warnings go to stderr. Use ouvir.py, not this file."""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import warnings

os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')
os.environ.setdefault('EARSHOT_THREADS', '2')

import numpy as np  # noqa: E402

warnings.filterwarnings('ignore', category=UserWarning)  # librosa warns on short files; the result says so

NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
EDGE_FRAME_S = 0.005


class Fail(Exception):
    """A problem the person or the agent can act on: message plus the fix."""

    def __init__(self, message: str, fix: str = ''):
        super().__init__(message)
        self.fix = fix


def _j(value):
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    raise TypeError(f'{type(value).__name__} is not JSON serializable')


def r1(value, digits=1):
    return None if value is None else round(float(value), digits)


def load(path, start=None, end=None):
    from earshot import audio
    try:
        probe = audio.probe(path)
        x = audio.load(path, start=start, end=end, cache=False)
    except audio.AudioError as exc:
        raise Fail(str(exc), 'check the path, and that the file has an audio track') from None
    if not len(x):
        raise Fail('There is no audio in that file or range.', 'check the path, --start and --end')
    return x, probe


def peak_dbfs(x):
    return 20 * math.log10(max(float(np.abs(x).max()), 1e-9))


def edges(x, floor_db):
    """Seconds of silence (peak under floor_db on 5 ms frames) at the start and at the end of the file."""
    from earshot import audio
    hop = int(EDGE_FRAME_S * audio.SR)
    peak = np.abs(x).max(axis=1) if x.ndim == 2 else np.abs(x)
    frames = peak[: len(peak) // hop * hop].reshape(-1, hop).max(axis=1)
    live = np.where(frames > 10 ** (floor_db / 20))[0]
    total = len(x) / audio.SR
    if not len(live):
        return {'all_silent': True, 'start_s': r1(total, 3), 'end_s': r1(total, 3)}
    return {'all_silent': False, 'start_s': r1(live[0] * EDGE_FRAME_S, 3),
            'end_s': r1(max(0.0, total - (live[-1] + 1) * EDGE_FRAME_S), 3)}


def measure_core(path, start=None, end=None, floor_db=-60.0):
    from earshot import audio, features, timeline
    x, probe = load(path, start, end)
    mono_source = probe.get('channels') == 1
    m = features.measure(x, light=True)
    if m.get('error'):
        raise Fail('That is too short to measure (under 5 ms).', '')
    out = {'duration_s': r1(len(x) / audio.SR, 3), 'sample_rate_hz': probe.get('src_rate') or None,
           'channels': probe.get('channels') or None, 'codec': probe.get('codec'),
           'peak_dbfs': m.get('peak_dbfs'), 'true_peak_dbtp': m.get('true_peak_dbtp'), 'rms_dbfs': m.get('rms_dbfs')}
    # earshot reads a mono file as the same signal in both channels, which is 3 dB hotter than the single-channel
    # reading every loudness meter gives a mono file: undo that.
    shift = -3.01 if mono_source else 0.0
    out['integrated_lufs'] = r1(m['lufs'] + shift) if 'lufs' in m else None
    out['short_term_max_lufs'] = r1(m['short_term_max_lufs'] + shift) if 'short_term_max_lufs' in m else None
    out['lra_lu'] = m.get('lra_lu')
    floor = m.get('noise_floor_dbfs')
    quiet_ok = floor is not None and floor > -90  # digital silence has no noise floor to measure against
    out['noise_floor_dbfs'] = floor if quiet_ok else None
    out['dynamic_range_db'] = m.get('dynamic_range_db') if quiet_ok else None  # loudest 20 ms minus noise floor
    out['crest_factor_db'] = r1(m['peak_dbfs'] - m['rms_dbfs'])
    out['clipped_samples'] = m.get('clipped_samples')
    out['brightness_hz'] = m.get('brightness_hz')
    out['bandwidth_hz'] = m.get('bandwidth_hz')
    out['bands_db'] = m.get('bands_db')
    out['stereo_correlation'] = None if mono_source else m.get('correlation')
    out['silence'] = dict(edges(x, floor_db), floor_dbfs=floor_db)
    gaps = [g for g in timeline.loudness(x)['silences'] if not g.get('where')]
    out['silence']['gaps_inside'] = [{'start_s': g['start'], 'end_s': g['end'], 'kind': g['kind']} for g in gaps]
    notes = []
    if out['integrated_lufs'] is None:
        notes.append('Loudness needs at least 0.4 s of audio.')
    if out['lra_lu'] is None:
        notes.append('Loudness range needs at least 6 s of audio.')
    if not quiet_ok:
        notes.append('The quietest parts are digital silence, so there is no noise floor or dynamic range to report.')
    if mono_source:
        notes.append('Mono source: loudness is the single-channel reading, as ffmpeg ebur128 gives.')
    if (probe.get('channels') or 0) > 2:
        notes.append('More than two channels: measured on a stereo downmix.')
    if out['clipped_samples']:
        notes.append(f"{out['clipped_samples']} clipped samples.")
    if out['silence'].get('all_silent'):
        notes.append('The whole file is below the silence floor.')
    out['notes'] = notes
    return out


def cmd_measure(a):
    return measure_core(a.file, a.start, a.end, a.floor_db)


# ---------------------------------------------------------------- events and the cue sheet
def event_list(x, min_prominence_db=6.0):
    from earshot import audio, timeline
    found = [e for e in timeline.detect_events(x)
             if e.get('starts_file') or e['prominence_db'] >= min_prominence_db]
    mono = np.abs(x).max(axis=1) if x.ndim == 2 else np.abs(x)
    out = []
    for e in found:
        a = int(e['t'] * audio.SR)
        b = a + int(max(0.05, min(e['length_ms'] / 1000, 0.3)) * audio.SR)
        seg = mono[a:max(b, a + 1)]
        peak_t = e['t'] + float(np.argmax(seg)) / audio.SR if len(seg) else e['t']
        out.append({'t': e['t'], 'kind': e['shape'], 'at_file_start': bool(e.get('starts_file')), 'peak_t': round(peak_t, 3), 'peak_dbfs': e['peak_dbfs'],
                    'prominence_db': e['prominence_db'], 'length_ms': r1(e['length_ms'], 0), 'band': e['band']})
    return out


def read_cues(source, fps):
    if os.path.isfile(source):
        with open(source, encoding='utf-8-sig') as stream:
            data = json.load(stream)
    else:
        try:
            data = json.loads(source)
        except ValueError:
            raise Fail('The cue sheet is neither a file nor JSON.',
                       'give a JSON file: [{"time": 2.5, "label": "hit", "tolerance_ms": 40}, ...]') from None
    if isinstance(data, dict):
        fps = data.get('fps') or fps
        data = data.get('cues') or data.get('events') or []
    cues = []
    for i, item in enumerate(data):
        item = {'time': item} if isinstance(item, (int, float)) else item
        t = next((item[k] for k in ('time', 't', 'seconds', 'sec') if k in item), None)
        frame = next((item[k] for k in ('frame', 'f') if k in item), None)
        if t is None and frame is not None and fps:
            t = float(frame) / float(fps)
        if t is None:
            raise Fail(f'Cue {i + 1} has no time.', 'give "time" in seconds, or "frame" together with "fps"')
        tol = item.get('tolerance_ms')
        if tol is None and item.get('tolerance') is not None:
            tol = float(item['tolerance']) * 1000.0
        cues.append({'time': float(t), 'label': item.get('label') or item.get('id') or f'cue {i + 1}',
                     'tolerance_ms': None if tol is None else float(tol)})
    return sorted(cues, key=lambda c: c['time'])


def check_cues(events, cues, default_tol_ms):
    ts = np.array([e['t'] for e in events])
    pk = np.array([e['peak_t'] for e in events])
    rows = []
    for c in cues:
        tol = (c['tolerance_ms'] if c['tolerance_ms'] is not None else default_tol_ms) / 1000.0
        row = {'time': c['time'], 'label': c['label'], 'tolerance_ms': round(tol * 1000, 1)}
        best = None
        for name, arr in (('onset', ts), ('peak', pk)):
            if len(arr):
                i = int(np.argmin(np.abs(arr - c['time'])))
                d = float(arr[i] - c['time'])
                if best is None or abs(d) < abs(best[2]):
                    best = (name, i, d)
        if best and abs(best[2]) <= tol:
            row.update(status='hit', matched_on=best[0], offset_ms=round(best[2] * 1000, 1), event_t=events[best[1]]['t'],
                       event_peak_t=events[best[1]]['peak_t'])
        else:
            row.update(status='miss', nearest_offset_ms=None if best is None else round(best[2] * 1000, 1))
        rows.append(row)
    return rows


def chance(events, cues, tol_s):
    """Share of random times, in the span of the cues, that would also have an onset or a peak within tolerance."""
    arr = np.sort(np.array([e['t'] for e in events] + [e['peak_t'] for e in events]))
    if not len(arr) or not cues:
        return 0.0
    grid = np.arange(cues[0]['time'] - 1.0, cues[-1]['time'] + 1.0, 0.005)
    k = np.clip(np.searchsorted(arr, grid), 1, max(1, len(arr) - 1))
    d = np.minimum(np.abs(grid - arr[k - 1]), np.abs(grid - arr[np.minimum(k, len(arr) - 1)]))
    return round(float(np.mean(d <= tol_s)), 3)


def cmd_events(a):
    x, _ = load(a.file, a.start, a.end)
    events = event_list(x, a.min_prominence_db)
    out = {'event_count': len(events), 'events': events,
           'how_to_read': 'kind hit = a new attack, t = its start, peak_t = where it is loudest; kind swell = a build-up. '
                          'These are onsets of any sound in the file, not labels of what made them. Only events at least '
                          f'{a.min_prominence_db:g} dB above the sound just before are listed.'}
    if a.cues:
        cues = read_cues(a.cues, a.fps)
        rows = check_cues(events, cues, a.tolerance_ms)
        hits = [r for r in rows if r['status'] == 'hit']
        tol_s = float(np.median([r['tolerance_ms'] for r in rows])) / 1000.0 if rows else 0.0
        rate = len(hits) / len(rows) if rows else 0.0
        by_chance = chance(events, cues, tol_s)
        notes = []
        if rows and rate - by_chance < 0.25:
            notes.append('The hit rate is close to what random times would score, because this file holds many sounds. '
                         'It does not prove sync: run it on the effects stem alone, or listen to the misses.')
        if len(rows) and rate == 1.0 and by_chance > 0.6:
            notes.append(f'Random times would hit {by_chance:.0%} of the time at this tolerance.')
        out['cue_check'] = {'cues': rows, 'hits': len(hits), 'misses': len(rows) - len(hits),
                            'hit_rate': round(rate, 3), 'chance_hit_rate': by_chance,
                            'median_abs_offset_ms': r1(np.median([abs(r['offset_ms']) for r in hits])) if hits else None,
                            'missing': [r['label'] for r in rows if r['status'] == 'miss'], 'notes': notes}
    return out


# ---------------------------------------------------------------- key and tempo
RELATIVE = {'major': 3, 'minor': -3}


def note_name(hz):
    midi = 69 + 12 * math.log2(hz / 440.0)
    k = int(round(midi))
    return f'{NOTES[k % 12]}{k // 12 - 1}', int(round((midi - k) * 100))


def cmd_key(a):
    from earshot import audio, features, timeline
    x, _ = load(a.file, a.start, a.end)
    m = audio.to_mono(x)
    dur = len(m) / audio.SR
    ranked = features.key_estimate(m)
    top, second = ranked[0], ranked[1]
    margin = top['r'] - second['r']
    why = []
    pitch = None
    meas = features.measure(x, light=False)
    notes_played = meas.get('onset_count', 0)
    if meas.get('f0_hz') and notes_played <= 2:  # a pitch means something for one note, not for a chord or a mix
        name, cents = note_name(meas['f0_hz'])
        pitch = {'hz': meas['f0_hz'], 'note': name, 'cents': cents, 'harmonic_ratio': meas.get('harmonic_ratio')}
    if dur < 4:
        why.append('under 4 s: too short for a key to be averaged out')
    if pitch and notes_played <= 2:
        why.append('one or two notes: the chroma shows which note it is, not a key; use the pitch')
    tonic, mode = top['key'].split()
    relative = f"{NOTES[(NOTES.index(tonic) + RELATIVE[mode]) % 12]} {'minor' if mode == 'major' else 'major'}"
    if second['key'] == relative:
        why.append(f'{top["key"]} and its relative {relative} are close; the label may be either')
    if margin < 0.05:
        why.append(f'the second guess ({second["key"]}) is almost as strong')
    if top['r'] < 0.5:
        why.append('weak correlation with any key profile (atonal, noisy or percussive material)')
    reliable = not why
    grid = timeline.music_grid(m) if dur >= 5 else {'tempo': None, 'confidence': 'none', 'note': 'under 5 s: no tempo'}
    tempo_ok = grid.get('confidence') in ('clear', 'weak') and grid.get('tempo')
    return {'duration_s': round(dur, 2),
            'key': {'best': top['key'], 'correlation': top['r'], 'candidates': ranked, 'reliable': reliable,
                    'why_not_reliable': why,
                    'method': 'chroma (librosa) against the Krumhansl-Kessler key profiles; major or minor, no modes'},
            'pitch': pitch,
            'tempo': {'bpm': grid.get('tempo') if tempo_ok else None, 'bpm_alt': grid.get('tempo_alt') if tempo_ok else None,
                      'confidence': grid.get('confidence'), 'pulse_clarity': grid.get('pulse_clarity'),
                      'beats_s': grid.get('beats', [])[:64], 'note': grid.get('note'),
                      'reliable': grid.get('confidence') == 'clear'},
            'how_to_read': 'Trust key only when reliable is true, and tempo only when its confidence is clear. '
                           'Tempo can be half or double the felt one (see bpm_alt). Neither was validated on real '
                           'music by this skill: confirm by ear against the person.'}


# ---------------------------------------------------------------- comparison of two files, or a file and a text
def delta_words(a, b):
    words = []
    for key, label, unit in (('integrated_lufs', 'louder', 'LU'), ('true_peak_dbtp', 'higher true peak', 'dB'),
                             ('lra_lu', 'wider loudness range', 'LU'), ('noise_floor_dbfs', 'higher noise floor', 'dB'),
                             ('brightness_hz', 'brighter', 'Hz')):
        if a.get(key) is not None and b.get(key) is not None:
            d = b[key] - a[key]
            if abs(d) >= (0.2 if unit != 'Hz' else 50):
                words.append(f'B is {abs(d):.1f} {unit} {label if d > 0 else label.replace("louder", "quieter").replace("higher", "lower").replace("wider", "narrower").replace("brighter", "darker")} than A')
    return words


def cmd_compare(a):
    if not a.text and not a.other:
        raise Fail('Nothing to compare with.', 'give a second file, or --text "a description of the sound"')
    if a.text:
        from earshot import match
        res = match.match(a.file, a.text, alts=a.alt or None, start=a.start, end=a.end)
        keep = ('summary', 'verdict', 'z', 'percentile', 'rank_in_vocab', 'p_vs_alts', 'alts', 'closest_vocab')
        return {'mode': 'file against a description', 'description': a.text,
                'result': {k: res[k] for k in keep if k in res},
                'how_to_read': 'Read the verdict and z, not the cosine. z >= 3 strong, 2.5 to 3 plausible, 2 to 2.5 '
                               'weak, under 2 no match. Describe the sound (source, material, action), not its use.'}
    ma, mb = measure_core(a.file, a.start, a.end), measure_core(a.other, a.start, a.end)
    keys = ('integrated_lufs', 'true_peak_dbtp', 'lra_lu', 'noise_floor_dbfs', 'brightness_hz', 'duration_s')
    out = {'mode': 'two files', 'a': {k: ma[k] for k in keys}, 'b': {k: mb[k] for k in keys},
           'difference_b_minus_a': {k: r1(mb[k] - ma[k], 2) for k in keys if ma[k] is not None and mb[k] is not None},
           'in_words': delta_words(ma, mb)}
    try:
        from earshot import compare
        ab = compare.ab(a.file, a.other, query=a.query)
        out['listening_model'] = {'summary': ab.get('summary'), 'cosine_ab': ab.get('cosine_ab')}
    except ImportError:
        out['listening_model'] = None
        out['notes'] = ['Only measured differences: the listening models are not installed '
                        '(ouvir_setup.py --install-models, ask first).']
    return out


# ---------------------------------------------------------------- the listening models
def mono_note(path):
    """earshot's loudness text for a mono file is the dual-mono reading; show the single-channel one, like measure."""
    from earshot import audio
    return audio.probe(path).get('channels') == 1


def top_tags(tags, n=6):
    flat = [dict(tag=t.get('term') or t.get('tag'), group=group, z=t['z']) for group, items in (tags or {}).items()
            for t in items]
    return sorted(flat, key=lambda t: -t['z'])[:n]


def cmd_describe(a):
    import re
    from earshot import describe
    res = describe.describe(a.file, start=a.start, end=a.end)
    summary = res.get('summary') or ''
    if mono_note(a.file):
        summary = re.sub(r'(-?\d+\.\d) LUFS', lambda m: f'{float(m.group(1)) - 3.01:.1f} LUFS', summary)
    out = {'overall': {'summary': summary, 'top_tags': top_tags(res.get('tags')),
                       'audioset': (res.get('audioset') or [])[:4]}}
    if not a.quick and (res.get('duration') or 0) >= 3:
        from earshot import timeline
        tl = timeline.timeline(a.file, start=a.start, end=a.end, detail='low')
        out['over_time'] = {
            'sections': [{'start': sec['start'], 'end': sec['end'], 'label': sec.get('label')}
                         for sec in tl.get('sections') or []],
            'events': [{'t': e['t'], 'label': e.get('label'), 'tags': [{'tag': x['tag'], 'z': x['z']} for x in e.get('tags', [])[:3]],
                        'prominence_db': e['prominence_db']}
                       for e in tl.get('events') or [] if e.get('prominence_db', 0) >= 6.0][:60]}
    out['how_to_read'] = ('Tags are guesses ranked by z; a tag on a dense mix is right about half the time. Times '
                          'and levels are measurements; for exact levels use measure. Describe a stem or a segment '
                          'for a sharper reading.')
    return out


def cmd_find(a):
    from earshot import search
    res = search.find(a.file, a.query, top=a.top, kind=a.kind, start=a.start, end=a.end)
    keep = ('start', 'end', 'duration', 'z', 'verdict', 'kind', 'peak_dbfs', 'head_db', 'tail_db', 'cut')
    return {'query': a.query, 'summary': res.get('summary'),
            'segments': [{k: seg.get(k) for k in keep} for seg in res.get('segments') or []],
            'how_to_read': 'Segments are trims in seconds. head_db and tail_db say how loud the first 5 ms and the '
                           'last 10 ms are against the trim peak (-30 or lower is clean); a trim marked head cut or '
                           'tail cut starts or ends inside a sound. The z and verdict say how well it matches.'}


def cmd_opinion(a):
    from earshot import llm
    if not os.environ.get('GEMINI_API_KEY'):
        raise Fail('No Gemini key is configured.', 'add GEMINI_API_KEY to the watch configuration')
    res = llm.critique(a.file, prompt=a.question, provider='gemini', model=a.model, consent=True,
                       start=a.start, end=a.end)
    for key in ('context_sent', 'text'):  # the rendering repeats the summary and the critique
        res.pop(key, None)
    return {'second_opinion': True, 'result': res,
            'how_to_read': 'A hosted model heard a reduced copy and gave an opinion. It is not a measurement and '
                           'it is not deterministic; its times are approximate. The person\'s ear decides.'}


COMMANDS = {'measure': cmd_measure, 'events': cmd_events, 'key': cmd_key, 'compare': cmd_compare,
            'describe': cmd_describe, 'find': cmd_find, 'opinion': cmd_opinion}


def main(argv=None):
    p = argparse.ArgumentParser(prog='engine.py')
    sub = p.add_subparsers(dest='command', required=True)
    for name in COMMANDS:
        s = sub.add_parser(name)
        s.add_argument('file')
        s.add_argument('--start', type=float)
        s.add_argument('--end', type=float)
        if name == 'measure':
            s.add_argument('--floor-db', type=float, default=-60.0)
        if name == 'events':
            s.add_argument('--cues')
            s.add_argument('--tolerance-ms', type=float, default=40.0)
            s.add_argument('--fps', type=float)
            s.add_argument('--min-prominence-db', type=float, default=6.0)
        if name == 'compare':
            s.add_argument('other', nargs='?')
            s.add_argument('--text')
            s.add_argument('--alt', action='append')
            s.add_argument('--query')
        if name == 'describe':
            s.add_argument('--quick', action='store_true')
        if name == 'find':
            s.add_argument('query')
            s.add_argument('--top', type=int, default=3)
            s.add_argument('--kind', default='auto')
        if name == 'opinion':
            s.add_argument('--question')
            s.add_argument('--model')
    args = p.parse_args(argv)
    real_stdout = sys.stdout
    sys.stdout = sys.stderr  # earshot may print; only the JSON below is the answer
    try:
        result = COMMANDS[args.command](args)
        payload = {'ok': True, 'command': args.command, 'file': args.file, **result}
        code = 0
    except Fail as exc:
        payload, code = {'ok': False, 'command': args.command, 'error': str(exc), 'fix': exc.fix}, 1
    except ModuleNotFoundError as exc:
        what = 'the listening models' if exc.name in ('torch', 'transformers') else f'the Python package {exc.name}'
        payload = {'ok': False, 'command': args.command, 'error': f'{what} is not installed.',
                   'fix': 'run ouvir_setup.py --install-models --yes (ask the person first)'
                          if exc.name in ('torch', 'transformers') else 'run ouvir_setup.py --install --yes'}
        code = 2
    except (ValueError, OSError, RuntimeError) as exc:
        payload, code = {'ok': False, 'command': args.command, 'error': str(exc), 'fix': ''}, 1
    sys.stdout = real_stdout
    print(json.dumps(payload, default=_j, indent=2, ensure_ascii=False))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
