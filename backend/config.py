import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / '.env')
DATA_DIR = Path(os.getenv('DATA_DIR', str(ROOT.parent / '.local')))
STORAGE = os.getenv('STORAGE', 'sqlite')
ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173').split(',')
MAX_PDF_BYTES = 5 * 1024 * 1024
MAX_PAGES = 5
MAX_TEXT_CHARS = 18000
GROQ_MODEL = os.getenv('GROQ_MODEL', 'openai/gpt-oss-120b')

