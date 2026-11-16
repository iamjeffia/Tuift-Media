#!/usr/bin/env python3
"""ouvir: hear and measure audio. One command, one JSON answer on stdout.

    ouvir.py measure FILE                       loudness, true peak, range, silence at the edges
    ouvir.py events FILE [--cues cues.json]     onsets and peaks; check a cue sheet
    ouvir.py key FILE                           key and tempo, with a reliability verdict
    ouvir.py compare A B                        two files, measured; or: compare A --text "a description"
    ouvir.py describe FILE                      what is heard, with times (needs the listening models)
    ouvir.py find FILE "a description"          best segment of a long recording (needs the listening models)
    ouvir.py speech FILE                        transcript with times, through the watch skill's backends
    ouvir.py opinion FILE --yes-upload          optional second opinion from Gemini (uploads the audio)

Standard library only: the analysis runs in the engine environment made by ouvir_setup.py.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ouvir_setup as setup  # noqa: E402

NEEDS_MODELS = {'describe', 'find'}


def emit(payload: dict, code: int = 0) -> int:
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return code


def fail(command: str, error: str, fix: str = '', code: int = 2) -> int:
    return emit({'ok': False, 'command': command, 'error': error, 'fix': fix}, code)


def media_error(command: str, path: str) -> int | None:
    missing = setup.missing_ffmpeg()
    if missing:
        return fail(command, f'ouvir needs ffmpeg and cannot find {", ".join(missing)}.', setup.ffmpeg_hint())
    if not Path(path).is_file():
        return fail(command, f'There is no file at {path}.', 'check the path', 1)
    return None


def run_engine(args: list[str], command: str, gemini: tuple[str, str] | None = None) -> int:
    if not setup.engine_ready():
        return fail(command, 'The audio engine is not installed yet.',
                    'ask the person, then run: ouvir_setup.py --install --yes (about 350 MB on disk, in its own folder)')
    env = dict(os.environ, EARSHOT_HOME=str(setup.EARSHOT_HOME), EARSHOT_OFFLINE='1', PYTHONUTF8='1')
    if gemini:
        env['GEMINI_API_KEY'], model = gemini
        args = [*args, '--model', model]
    done = subprocess.run([str(setup.venv_python()), str(HERE / 'engine.py'), *args], env=env,
                          stdout=subprocess.PIPE, text=True, encoding='utf-8', errors='replace')
    if done.stdout.strip():
        print(done.stdout.strip())
        return done.returncode
    return fail(command, f'The engine stopped without an answer (exit {done.returncode}); see the messages above.',
                'if it repeats, run ouvir_setup.py and check engine.measuring_ready', 1)


def speech(args) -> int:
    problem = media_error('speech', args.file)
    if problem is not None:
        return problem
    try:
        config = setup.import_watch('config')
        whisper = setup.import_watch('whisper')
        transcribe = setup.import_watch('transcribe')
        cfg = config.get_config()
        backend = args.backend or cfg['whisper_backend']
        if backend == 'none':
            return fail('speech', 'Speech transcription is switched off in the watch configuration.',
                        'run the setup of the watch skill and pick a transcription backend')
        with tempfile.TemporaryDirectory(prefix='ouvir-speech-') as temporary:
            segments, used = whisper.transcribe_video(args.file, Path(temporary) / 'audio.mp3',
                                                      backend=None if backend == 'auto' else backend)
    except (SystemExit, ValueError) as exc:  # ValueError: the watch ConfigError
        return fail('speech', str(exc), 'run the setup of the watch skill (one setup serves both skills)')
    segments = transcribe.filter_range(list(segments), args.start, args.end)
    return emit({'ok': True, 'command': 'speech', 'file': args.file, 'backend': used,
                 'audio_left_the_machine': used in ('groq', 'openai'), 'segment_count': len(segments),
                 'segments': [{k: s[k] for k in ('start', 'end', 'text')} for s in segments],
                 'how_to_read': 'Times are segment boundaries, not words. A short or noisy clip can come back empty or '
                                'wrong: say so, do not fill gaps. Set WATCH_WHISPERX_LANGUAGE when the language is known.'})


def opinion(args) -> int:
    problem = media_error('opinion', args.file)
    if problem is not None:
        return problem
    if not args.yes_upload:
        return fail('opinion', 'This sends the audio to Google Gemini, so it needs the person to agree first.',
                    'ask the person; if they agree, rerun with --yes-upload', 3)
    try:
        key = setup.import_watch('config').load_gemini_key()
        model = setup.import_watch('config').get_config()['gemini_model']
    except SystemExit as exc:
        return fail('opinion', str(exc))
    if not key:
        return fail('opinion', 'No Gemini key is configured.',
                    'add GEMINI_API_KEY with the setup of the watch skill (https://aistudio.google.com/apikey)')
    forward = ['opinion', args.file] + (['--question', args.question] if args.question else [])
    forward += [f'--{name}={value}' for name, value in (('start', args.start), ('end', args.end)) if value is not None]
    return run_engine(forward, 'opinion', gemini=(key, model))


def main() -> int:
    parser = argparse.ArgumentParser(prog='ouvir.py', description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)

    def add(name, *flags):
        p = sub.add_parser(name)
        p.add_argument('file')
        for flag in flags:
            p.add_argument(flag, type=float)
        return p

    p = add('measure', '--start', '--end')
    p.add_argument('--floor-db', type=float, default=-60.0, help='silence threshold in dBFS (default -60)')
    p = add('events', '--start', '--end', '--fps')
    p.add_argument('--cues', help='JSON file or JSON text: [{"time": 2.5, "label": "hit", "tolerance_ms": 40}]')
    p.add_argument('--tolerance-ms', type=float, default=40.0)
    p.add_argument('--min-prominence-db', type=float, default=6.0,
                   help='ignore onsets less than this far above the sound before them (default 6)')
    add('key', '--start', '--end')
    p = add('compare', '--start', '--end')
    p.add_argument('other', nargs='?', help='a second file to compare with')
    p.add_argument('--text', help='compare the file with this description instead')
    p.add_argument('--alt', action='append', help='a realistic confusion to test the description against')
    p.add_argument('--query', help='with two files: which one is closer to this description')
    p = add('describe', '--start', '--end')
    p.add_argument('--quick', action='store_true', help='skip the over-time reading (faster)')
    p = add('find', '--start', '--end')
    p.add_argument('query')
    p.add_argument('--top', type=int, default=3)
    p.add_argument('--kind', choices=['auto', 'event', 'texture'], default='auto')
    p = add('speech', '--start', '--end')
    p.add_argument('--backend', choices=['groq', 'openai', 'whisperx'])
    p = add('opinion', '--start', '--end')
    p.add_argument('--question')
    p.add_argument('--yes-upload', action='store_true', help='the person agreed to upload this audio to Google')
    args = parser.parse_args()

    if args.command == 'speech':
        return speech(args)
    if args.command == 'opinion':
        return opinion(args)
    problem = media_error(args.command, args.file)
    if problem is not None:
        return problem
    if args.command == 'compare' and args.other:
        problem = media_error('compare', args.other)
        if problem is not None:
            return problem
    needs_models = args.command in NEEDS_MODELS or (args.command == 'compare' and args.text)
    if needs_models and setup.engine_ready() and not setup.models_ready():
        return fail(args.command, 'This command uses the listening models, which are not installed.',
                    'ask the person, then run: ouvir_setup.py --install-models --yes (about 1.3 GB to download, 4.5 GB on disk)')
    forward = [sys.argv[1], *sys.argv[2:]]
    return run_engine(forward, args.command)


if __name__ == '__main__':
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8', errors='backslashreplace')
    raise SystemExit(main())
