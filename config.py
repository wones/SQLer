import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'sql-assistant-secret-key'
    DATABASE_PATH = os.environ.get('DATABASE_PATH') or 'instance/sql_assistant.db'
    LLM_API_KEY = os.environ.get('LLM_API_KEY') or ''
    LLM_MODEL_NAME = os.environ.get('LLM_MODEL_NAME') or 'gpt-4'
    LLM_API_BASE_URL = os.environ.get('LLM_API_BASE_URL') or 'https://api.openai.com/v1'
    LLM_TEMPERATURE = float(os.environ.get('LLM_TEMPERATURE') or 0.7)
    LLM_MAX_TOKENS = int(os.environ.get('LLM_MAX_TOKENS') or 4096)