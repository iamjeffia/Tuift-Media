# Design flow: evidence of the real runs (16 Nov)

Each folder is one real run of the Design pipeline through the real server and Claude Code, in a
temporary data folder, on a free port, with the capture done by hidden windows, from a temporary
copy of the project. The provider's own config folder held only the login, so no personal hook
or setting took part.

| Folder              | Request                          | Turns | Seconds | Before (diagnosis)            |
| ------------------- | -------------------------------- | ----: | ------: | ----------------------------- |
| `1-revisao`         | review of a 3-page site          |     5 |     110 | 15 turns, 351 s               |
| `2-animacao`        | entrance animation and hover     |     7 |     129 | 10 turns, 205 s               |
| `3-redesign`        | redesign of three pages          |    18 |     891 | 12 turns, 1791 s, 1 page seen |
| `4-modelo-pequeno`  | new page, smallest model, low    |    12 |     430 | failed after 5 turns          |
| `captura-escondida` | the capture on the fixture pages |     - |       - | -                             |

Each run folder has `summary.json` (turns, seconds, phases, pages captured), `linha-do-tempo.txt`,
`chat-visivel.txt` (what the chat showed, with the English text of the coded messages),
`review.json` when the run wrote one, `arquivos-da-pasta.txt` and the last captures. The review run
captured `/index.html` as a fourth page next to `/`: the same page under two addresses, fixed
afterwards (`linkedRoutes` folds `/index.html` into `/`).
