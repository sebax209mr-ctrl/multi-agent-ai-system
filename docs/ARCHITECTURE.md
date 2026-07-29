# Architecture

This document describes how the pieces of this multi-agent AI system fit together, and how to extend it.

## Overview

The system is built around one **orchestrator** agent and any number of **worker** agents. The orchestrator receives a task, distributes it (or sub-tasks derived from it) to the relevant workers, and aggregates their outputs into a final result.

## Components

- **agents.yaml** - declarative configuration listing the orchestrator and each worker agent, including their role description, underlying model, and available tools.
- **agents/base_agent.py** - the `BaseAgent` class and `Message` data structure shared by every agent. All agents track a message history and expose a `run(task)` method.
- **agents/orchestrator.py** - the `Orchestrator` class, which builds worker agents from config and coordinates delegation.
- **main.py** - CLI entry point that loads configuration and runs the orchestrator against a task supplied on the command line.

## Communication Model

Agents communicate using simple `Message` objects that carry a sender, content, and optional metadata. The current starter implementation uses direct, synchronous method calls (`orchestrator.run()` -> `worker.run()`), but the `Message` abstraction is designed so you can swap in a message queue, pub/sub system, or an existing framework's native messaging (LangChain, CrewAI, AutoGen) without changing the public interface of `BaseAgent`.

## Extending the System

To add a new agent:

- Add an entry under `agents` in `agents.yaml` with a name, role, model, and tools.
- If the agent needs custom behavior beyond the generic `WorkerAgent`, create a new subclass of `BaseAgent` in `agents/` and override `run()`.
- Wire the new subclass into `Orchestrator` if it should be constructed differently from the generic workers.

## Sharing This Repo

Since this project is meant to be shared with collaborators, keep in mind:

- Configuration changes (`agents.yaml`) and code changes are easiest to review when kept in separate commits or pull requests.
- Do not commit real API keys or secrets; use environment variables and a local `.env` file (already covered by `.gitignore`).
- Document any new agent types you add in this file so the team has a single source of truth.
