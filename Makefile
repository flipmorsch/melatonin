PREFIX ?= $(HOME)/.local
WAILS ?= $(HOME)/go/bin/wails

build:
	$(WAILS) build -tags webkit2_41

install: build
	install -Dm755 build/bin/melatonin $(PREFIX)/bin/melatonin
	install -Dm644 build/appicon.png $(PREFIX)/share/icons/melatonin.png
	mkdir -p $(PREFIX)/share/applications
	printf '[Desktop Entry]\nType=Application\nName=melatonin\nComment=Local-first API client + mock server\nExec=%s/bin/melatonin\nIcon=%s/share/icons/melatonin.png\nCategories=Development;\nTerminal=false\n' "$(PREFIX)" "$(PREFIX)" > $(PREFIX)/share/applications/melatonin.desktop

uninstall:
	rm -f $(PREFIX)/bin/melatonin $(PREFIX)/share/icons/melatonin.png $(PREFIX)/share/applications/melatonin.desktop

.PHONY: build install uninstall
