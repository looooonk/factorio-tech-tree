# Factorio Tech Tree

An interactive tech tree explorer for Factorio, backed by a lightweight crawler that scrapes the Factorio Wiki and exports a JSONL dataset.

## Repo layout
| Path | Description |
| --- | --- |
| `crawler/` | Python crawler that scrapes the Factorio Wiki and exports `tech_tree.jsonl`. |
| `factorio-tech-tree/` | Next.js app that renders the tech tree from JSONL and images. |

## Run the app
```bash
cd factorio-tech-tree
npm install
npm run dev
```
Open `http://localhost:3000`.

Actual website hosting is being worked on.

## Update the data
The crawler writes JSONL data that the app loads from `factorio-tech-tree/data/tech_tree.jsonl`.

```bash
cd crawler
python -m venv .venv
source .venv/bin/activate
pip install requests beautifulsoup4

python main.py --output-jsonl ../factorio-tech-tree/data/tech_tree.jsonl
```

## Data notes
- Tech data lives in `factorio-tech-tree/data/tech_tree.jsonl`.
- Tech images live in `factorio-tech-tree/data/tech_images` and are served via `/api/tech-image`.
