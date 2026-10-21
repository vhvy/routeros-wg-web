package main

import (
	"flag"
	"log"
	"routeros-wg-web/internal/server"
)

func main() {
	configFile := flag.String("config", "../config.json", "configuration JSON file")
	flag.Parse()
	if err := server.Run(*configFile); err != nil {
		log.Fatal(err)
	}
}
