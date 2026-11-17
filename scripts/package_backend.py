"""Build a Python 3.11 / Linux x86_64 Lambda archive without Docker."""
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    build = ROOT / '.build'
    build.mkdir(exist_ok=True)
    artifact = build / 'backend.zip'
    with tempfile.TemporaryDirectory(prefix='lambda-', dir=build) as temp:
        dependencies = Path(temp)
        subprocess.run([
            sys.executable, '-m', 'pip', 'install',
            '--requirement', str(ROOT / 'backend' / 'requirements.txt'),
            '--target', str(dependencies), '--platform', 'manylinux2014_x86_64',
            '--implementation', 'cp', '--python-version', '3.11',
            '--only-binary=:all:', '--no-compile', '--disable-pip-version-check',
        ], check=True)
        with zipfile.ZipFile(artifact, 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(dependencies.rglob('*')):
                if path.is_file() and '__pycache__' not in path.parts:
                    archive.write(path, path.relative_to(dependencies))
            for path in sorted((ROOT / 'backend').glob('*.py')):
                archive.write(path, path.name)
            for path in sorted((ROOT / 'backend' / 'assets').glob('*.pdf')):
                archive.write(path, Path('assets') / path.name)
    print(f'Lambda archive: {artifact} ({artifact.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
