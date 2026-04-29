import os
from crewai import LLM


def build_llm() -> LLM:
    model = os.getenv('OPENAI_MODEL_NAME', 'gpt-4o-mini')
    return LLM(model=model, temperature=0.3)
