#!/usr/bin/env python3
"""Status and setup for the ouvir skill: the pinned earshot engine in its own virtual environment.

Nothing is installed unless a flag asks for it, and the two installs refuse to run without --yes, so the person
is always asked first. Speech and the second opinion reuse the configuration of the `watch` skill
(~/.config/watch/.env); this script never writes it.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

# earshot v0.4.1 (MIT, https://github.com/Leonxlnx/earshot), pinned by commit and archive hash.
EARSHOT_COMMIT = '4ac3d2ac2b151e1c23376f9ce7f3047a17050013'
EARSHOT_VERSION = '0.4.1'
EARSHOT_ARCHIVE = f'https://github.com/Leonxlnx/earshot/archive/{EARSHOT_COMMIT}.zip'
EARSHOT_SHA256 = '2878ba45bb08378771160a9dcf7c4339caf7a2d7935f241681ba081f4564abf9'
PYTHON = '3.12'
# The measuring half of earshot: no neural models. earshot itself goes in with --no-deps.
MEASURE_PACKAGES = ['numpy==2.5.5', 'scipy==1.18.1', 'soundfile==0.14.0', 'soxr==1.1.0', 'librosa==1.0.1',
                    'pillow==13.0.0', 'requests==2.34.2']
# The listening half: CPU PyTorch and the two models earshot pins (about 1 GB of downloads in all).
TORCH_PACKAGES = ['torch==2.8.0']
MODEL_PACKAGES = ['transformers==4.57.3']

HOME = Path(os.environ.get('OUVIR_HOME') or Path.home() / '.cache' / 'ouvir')
VENV = HOME / 'venv'
EARSHOT_HOME = HOME / 'earshot'
MARKER = VENV / 'ouvir-engine.json'
SKILLS_DIR = Path(__file__).resolve().parents[2]


def venv_python() -> Path:
    return VENV / ('Scripts/python.exe' if platform.system() == 'Windows' else 'bin/python')


def read_marker() -> dict:
    try:
        return json.loads(MARKER.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def engine_ready() -> bool:
    mark = read_marker()
    return bool(mark.get('measure') and mark.get('commit') == EARSHOT_COMMIT and venv_python().is_file())


def models_ready() -> bool:
    mark = read_marker()
    return bool(engine_ready() and mark.get('models'))


def watch_scripts() -> Path | None:
    """The sibling `watch` skill: one transcription setup and one Gemini key for both skills."""
    path = SKILLS_DIR / 'watch' / 'scripts'
    return path if (path / 'config.py').is_file() else None


def import_watch(name: str):
    path = watch_scripts()
    if path is None:
        raise SystemExit('Speech and the second opinion reuse the `watch` skill, which is not installed next to '
                         'this one. Install `watch`, run its setup, then retry.')
    if str(path) not in sys.path:
        sys.path.append(str(path))
    return importlib.import_module(name)


def ffmpeg_hint() -> str:
    system = platform.system()
    if system == 'Windows':
        return 'Install it with: winget install --id Gyan.FFmpeg --exact (then reopen the terminal or the app).'
    if system == 'Darwin':
        return 'Install it with: brew install ffmpeg'
    return 'Install it with your package manager, for example: sudo apt install ffmpeg'


def missing_ffmpeg() -> list[str]:
    return [name for name in ('ffmpeg', 'ffprobe') if not shutil.which(name)]


def find_uv() -> str | None:
    found = shutil.which('uv')
    if found:
        return found
    fallback = Path.home() / '.local' / 'bin' / ('uv.exe' if platform.system() == 'Windows' else 'uv')
    return str(fallback) if fallback.is_file() else None


def uv_hint() -> str:
    system = platform.system()
    if system == 'Windows':
        return 'Install uv with: winget install --id astral-sh.uv --exact (then reopen the terminal or the app).'
    if system == 'Darwin':
        return 'Install uv with: brew install uv'
    return 'Install uv from https://docs.astral.sh/uv/ (for example: pipx install uv).'


def speech_status() -> dict:
    """What `speech` can use today, read from the watch configuration without touching the network."""
    if watch_scripts() is None:
        return {'ready': False, 'reason': 'the watch skill is not installed next to ouvir'}
    try:
        status = import_watch('setup')._status()
    except (SystemExit, Exception) as exc:  # noqa: BLE001 - a status call must not crash on a broken config
        return {'ready': False, 'reason': f'could not read the watch configuration ({type(exc).__name__})'}
    ready = bool(status.get('backend_ready'))
    return {'ready': ready, 'backend': status.get('whisper_backend'),
            'reason': None if ready else 'no transcription backend is ready; run the setup of the watch skill',
            'gemini_key_present': bool(status.get('gemini_key_present')), 'gemini_model': status.get('gemini_model')}


def status() -> dict:
    missing = missing_ffmpeg()
    mark = read_marker()
    return {
        'ffmpeg': not missing, 'missing_binaries': missing,
        'ffmpeg_hint': ffmpeg_hint() if missing else None,
        'uv': bool(find_uv()),
        'engine': {'name': 'earshot', 'version': EARSHOT_VERSION, 'commit': EARSHOT_COMMIT,
                   'measuring_ready': engine_ready(), 'listening_models_ready': models_ready(),
                   'installed_commit': mark.get('commit'), 'home': str(HOME)},
        'speech': speech_status(),
        'commands_ready': {
            'measure/events/key/compare files': engine_ready() and not missing,
            'describe/find/compare with a description': models_ready() and not missing,
            'speech': speech_status()['ready'] and not missing,
        },
        'next_step': None if models_ready() else (
            'ask the person, then run: ouvir_setup.py --install --yes' if not engine_ready()
            else 'optional, ask first: ouvir_setup.py --install-models --yes (about 1.3 GB to download, 4.5 GB on disk; '
                 'needed by describe, find and compare with a description)'),
    }


def _run(cmd: list, step: str) -> None:
    print(f'[ouvir setup] {step}', file=sys.stderr, flush=True)
    try:
        result = subprocess.run([str(part) for part in cmd])
    except OSError as exc:
        raise SystemExit(f'{step}: cannot run {cmd[0]} ({type(exc).__name__}).') from None
    if result.returncode:
        raise SystemExit(f'{step} failed (exit {result.returncode}). Read the error above; the install can be '
                         'repeated and picks up where it stopped.')


def _need_ready_tools() -> str:
    missing = missing_ffmpeg()
    if missing:
        raise SystemExit(f'Missing {", ".join(missing)}: ouvir needs ffmpeg to read audio. {ffmpeg_hint()}')
    uv = find_uv()
    if not uv:
        raise SystemExit(f'ouvir installs its engine with uv, which is not installed. {uv_hint()}')
    return uv


def _download_earshot(target: Path) -> Path:
    archive = target / 'earshot.zip'
    request = urllib.request.Request(EARSHOT_ARCHIVE, headers={'User-Agent': 'ouvir-setup'})
    try:
        with urllib.request.urlopen(request, timeout=120) as response, archive.open('wb') as out:
            shutil.copyfileobj(response, out)
    except OSError as exc:
        raise SystemExit(f'Could not download earshot from GitHub ({type(exc).__name__}); check the network or '
                         'proxy and retry.') from None
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if digest != EARSHOT_SHA256:
        raise SystemExit('The earshot archive does not match the pinned hash; nothing was installed. '
                         'GitHub may have regenerated the archive: report it instead of bypassing the check.')
    with zipfile.ZipFile(archive) as bundle:
        bundle.extractall(target)
    return next(path for path in target.iterdir() if path.is_dir())


def install_measuring() -> int:
    uv = _need_ready_tools()
    python = venv_python()
    if not python.is_file():
        if VENV.exists():
            shutil.rmtree(VENV)
        HOME.mkdir(parents=True, exist_ok=True)
        _run([uv, 'venv', VENV, '--python', PYTHON], f'Create a Python {PYTHON} environment in {VENV}')
    _run([uv, 'pip', 'install', '--python', python, *MEASURE_PACKAGES], 'Install the audio libraries')
    with tempfile.TemporaryDirectory(prefix='ouvir-earshot-') as temporary:
        source = _download_earshot(Path(temporary))
        _run([uv, 'pip', 'install', '--python', python, '--no-deps', source], f'Install earshot {EARSHOT_VERSION}')
    check = subprocess.run([str(python), '-c', 'import earshot.features, earshot.timeline'], capture_output=True)
    if check.returncode:
        raise SystemExit('earshot installed but does not import; delete the folder '
                         f'{VENV} and run the install again.')
    mark = read_marker()
    mark.update({'commit': EARSHOT_COMMIT, 'version': EARSHOT_VERSION, 'measure': True})
    MARKER.write_text(json.dumps(mark, indent=2), encoding='utf-8')
    print(f'[ouvir setup] The measuring engine is ready in {HOME}.', file=sys.stderr)
    return 0


def install_models() -> int:
    uv = _need_ready_tools()
    if not engine_ready():
        raise SystemExit('Install the measuring engine first: ouvir_setup.py --install --yes')
    python = venv_python()
    torch_index = [] if platform.system() == 'Darwin' else ['--index-url', 'https://download.pytorch.org/whl/cpu']
    _run([uv, 'pip', 'install', '--python', python, *TORCH_PACKAGES, *torch_index], 'Install CPU PyTorch')
    _run([uv, 'pip', 'install', '--python', python, *MODEL_PACKAGES], 'Install transformers')
    env = dict(os.environ, EARSHOT_HOME=str(EARSHOT_HOME))
    EARSHOT_HOME.mkdir(parents=True, exist_ok=True)
    print('[ouvir setup] Downloading the two pinned listening models (about 1.1 GB).', file=sys.stderr, flush=True)
    done = subprocess.run([str(python), '-m', 'earshot', 'doctor', '--fetch'], env=env)
    if done.returncode:
        raise SystemExit('The models could not be downloaded (network, proxy or disk space); the install can be '
                         'repeated and resumes.')
    mark = read_marker()
    mark['models'] = True
    MARKER.write_text(json.dumps(mark, indent=2), encoding='utf-8')
    print('[ouvir setup] The listening models are ready.', file=sys.stderr)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--json', action='store_true', help='print the status as JSON (default)')
    mode.add_argument('--install', action='store_true',
                      help='install the measuring engine: audio libraries and earshot, about 350 MB on disk')
    mode.add_argument('--install-models', action='store_true',
                      help='also install the listening half: CPU PyTorch and two models, about 1.3 GB to download, 4.5 GB on disk')
    parser.add_argument('--yes', action='store_true', help='the person agreed to the download and the disk use')
    args = parser.parse_args()
    if args.install or args.install_models:
        if not args.yes:
            what = ('the audio libraries and earshot (about 350 MB on disk)' if args.install
                    else 'CPU PyTorch and two listening models (about 1.3 GB to download, 4.5 GB on disk)')
            print(f'This installs {what} into {HOME} and does not touch the rest of the machine. '
                  'Ask the person, then rerun with --yes.', file=sys.stderr)
            return 3
        try:
            return install_measuring() if args.install else install_models()
        except SystemExit as exc:
            print(f'[ouvir setup] {exc}', file=sys.stderr)
            return 2
    print(json.dumps(status(), indent=2))
    return 0 if not missing_ffmpeg() else 2


if __name__ == '__main__':
    raise SystemExit(main())
