package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "melatonin",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 12, G: 14, B: 22, A: 1}, // --ink-0
		OnStartup:        app.startup,
		// two instances would fight over the data files (in-process locking only)
		// and over mock ports; a second launch just focuses the existing window
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId:               "melatonin-1c8672f3-4a9f-4a2e-9a3f-6a2f0d6a51b7",
			OnSecondInstanceLaunch: app.focusFromSecondInstance,
		},
		Bind: []any{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
