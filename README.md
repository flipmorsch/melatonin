# melatonin

What you take to fix Insomnia: a local-first, subscription-free API tool — request client + mock server in one desktop app.

- `CONTEXT.md` — domain glossary
- `ROADMAP.md` — v1 scope and what's deliberately deferred

## Stack

Wails v2 (Go backend) + React/TypeScript frontend. Linux-first.

## One-time setup

```sh
go install github.com/wailsapp/wails/v2/cmd/wails@latest
sudo apt install libgtk-3-dev libwebkit2gtk-4.1-dev
```

Ubuntu/Pop!_OS 24.04 ships webkit2gtk **4.1** (not the 4.0 wails doctor mentions), so every wails command needs `-tags webkit2_41`.

## Development

```sh
wails dev -tags webkit2_41      # live-reload app; browser dev at http://localhost:34115
go test -tags webkit2_41 ./...  # Go tests
```

## Building

```sh
wails build -tags webkit2_41    # binary lands in build/bin/melatonin
```
