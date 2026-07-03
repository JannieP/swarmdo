---
name: iot-firmware
description: Orchestrate firmware rollouts with canary deployment and anomaly-gated advancement
allowed-tools: Bash(npx *) mcp__swarmdo__memory_store mcp__swarmdo__memory_search Read
argument-hint: "<deploy|advance|rollback|status|list> [options]"
---
Manage firmware rollouts across device fleets.

**deploy**: `npx -y -p @swarmdo/plugin-iot-cognitum@latest cognitum-iot firmware deploy FLEET_ID --version VERSION`
**advance**: `npx -y -p @swarmdo/plugin-iot-cognitum@latest cognitum-iot firmware advance ROLLOUT_ID`
**rollback**: `npx -y -p @swarmdo/plugin-iot-cognitum@latest cognitum-iot firmware rollback ROLLOUT_ID`
**status**: `npx -y -p @swarmdo/plugin-iot-cognitum@latest cognitum-iot firmware status ROLLOUT_ID`
**list**: `npx -y -p @swarmdo/plugin-iot-cognitum@latest cognitum-iot firmware list`

Rollout stages: pending → canary → rolling → complete (or rolled-back)
