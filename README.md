# Node.js + CrewAI multi-crew scaffold

This project is structured so **Node.js owns the API and routes**, while **Python owns CrewAI crews and execution**.

## Directory layout

```text
node-crewai-multi-crews/
├── .env.example
├── nodemon.json
├── package.json
├── README.md
├── python/
│   ├── crew_runner.py
│   ├── requirements.txt
│   └── crews/
│       ├── __init__.py
│       ├── registry.py
│       ├── shared/
│       │   ├── __init__.py
│       │   └── llm.py
│       ├── blog/
│       │   ├── __init__.py
│       │   └── crew.py
│       ├── pricing/
│       │   ├── __init__.py
│       │   └── crew.py
│       └── research/
│           ├── __init__.py
│           └── crew.py
└── src/
    ├── app.js
    ├── cli.js
    ├── server.js
    ├── config/
    │   └── env.js
    ├── controllers/
    │   └── crews/
    │       ├── blog.controller.js
    │       ├── pricing.controller.js
    │       └── research.controller.js
    ├── middleware/
    │   ├── errorHandler.js
    │   └── notFound.js
    ├── routes/
    │   ├── health.routes.js
    │   ├── index.js
    │   └── crews/
    │       ├── blog.routes.js
    │       ├── pricing.routes.js
    │       └── research.routes.js
    ├── services/
    │   └── crewRunner.service.js
    ├── utils/
    │   ├── asyncHandler.js
    │   └── httpError.js
    └── validators/
        └── crew.validator.js
```

## Why this structure?

CrewAI remains Python-first in its installation and core runtime, and its concepts center on Agents, Tasks, Crews, and Processes. The docs also show sequential execution and task context as first-class patterns. For maintainability, they additionally recommend YAML configuration for cleaner, scalable task/agent definitions, but for a child-process bridge this scaffold keeps the Python modules code-first and modular. citeturn140957search1turn140957search6turn140957search7turn140957search9turn140957search10

## Install

```bash
npm install
python3 -m venv .venv
source .venv/bin/activate
pip install -r python/requirements.txt
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env`.

## Run in development

```bash
npm run dev
```

## Routes

- `GET /health`
- `POST /api/crews/blog/run`
- `POST /api/crews/pricing/run`
- `POST /api/crews/research/run`

### Blog request body

```json
{
  "topic": "How should a SaaS startup price an analytics product?",
  "audience": "founder",
  "tone": "direct and practical"
}
```

### Pricing request body

```json
{
  "product": "analytics SaaS",
  "segment": "B2B SMB",
  "goal": "maximize paid conversion"
}
```

### Research request body

```json
{
  "topic": "AI agent observability",
  "depth": "brief",
  "audience": "product team"
}
```

## CLI examples

```bash
npm run ask:blog -- "How should a SaaS startup price an analytics product?"
npm run ask:pricing -- "analytics SaaS"
npm run ask:research -- "AI agent observability"
```

## Add a new crew

1. Create `python/crews/<crew_name>/crew.py`
2. Register it in `python/crews/registry.py`
3. Add a Node controller in `src/controllers/crews/`
4. Add a route in `src/routes/crews/`
5. Mount the route in `src/routes/index.js`

That keeps routes separate on the Node side and crews separate on the Python side.
