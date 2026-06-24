---
name: iot-fleet
description: Create and manage Cognitum Seed device fleets with firmware policies
allowed-tools: Bash(npx *) mcp__rufflo__memory_store mcp__rufflo__memory_search Read
argument-hint: "<create|list|add|remove|delete> [options]"
---
Manage device fleets. Parse subcommand from arguments.

**create**: `npx -y -p @rufflo/plugin-iot-cognitum@latest cognitum-iot fleet create --name NAME`
**list**: `npx -y -p @rufflo/plugin-iot-cognitum@latest cognitum-iot fleet list`
**add**: `npx -y -p @rufflo/plugin-iot-cognitum@latest cognitum-iot fleet add FLEET_ID DEVICE_ID`
**remove**: `npx -y -p @rufflo/plugin-iot-cognitum@latest cognitum-iot fleet remove FLEET_ID DEVICE_ID`
**delete**: `npx -y -p @rufflo/plugin-iot-cognitum@latest cognitum-iot fleet delete FLEET_ID`
