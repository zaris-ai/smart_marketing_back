import json
import sys
import traceback
from contextlib import redirect_stdout
from io import StringIO

from crews.registry import build_crew


def serialize_result(result):
    raw = getattr(result, "raw", None)
    tasks_output = getattr(result, "tasks_output", None)

    return {
        "content": raw if raw is not None else str(result),
        "tasks_output": [str(item) for item in tasks_output] if tasks_output else [],
    }


def main():
    noisy_buffer = StringIO()

    try:
        raw_input = sys.stdin.read()
        request = json.loads(raw_input)

        crew_name = request["crew_name"]
        payload = request.get("payload", {})

        with redirect_stdout(noisy_buffer):
            crew = build_crew(crew_name, payload)
            result = crew.kickoff()

        response = {
            "ok": True,
            "crew": crew_name,
            "result": serialize_result(result),
        }

        sys.stdout.write(json.dumps(response, ensure_ascii=False))
        sys.stdout.flush()

    except Exception as exc:
        sys.stderr.write(traceback.format_exc())
        error_response = {
            "ok": False,
            "error": str(exc),
        }
        sys.stdout.write(json.dumps(error_response, ensure_ascii=False))
        sys.stdout.flush()
        sys.exit(1)


if __name__ == "__main__":
    main()