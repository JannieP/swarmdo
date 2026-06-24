# stream-chain pipeline

Execute predefined pipelines for common development workflows.

## Usage

```bash
rufflo stream-chain pipeline <type> [options]
```

## Available Pipelines

### analysis
Code analysis and improvement pipeline.

```bash
rufflo stream-chain pipeline analysis
```

**Steps:**
1. Analyze current directory structure and identify main components
2. Based on analysis, identify potential improvements and issues
3. Generate detailed report with actionable recommendations

### refactor
Automated refactoring workflow.

```bash
rufflo stream-chain pipeline refactor
```

**Steps:**
1. Identify code that could benefit from refactoring
2. Create prioritized refactoring plan with specific changes
3. Provide refactored code examples for top 3 priorities

### test
Comprehensive test generation.

```bash
rufflo stream-chain pipeline test
```

**Steps:**
1. Analyze codebase and identify areas lacking test coverage
2. Design comprehensive test cases for critical functions
3. Generate unit test implementations with assertions

### optimize
Performance optimization pipeline.

```bash
rufflo stream-chain pipeline optimize
```

**Steps:**
1. Profile codebase and identify performance bottlenecks
2. Analyze bottlenecks and suggest optimization strategies
3. Provide optimized implementations for main issues

## Options

- `--verbose` - Show detailed execution
- `--timeout <seconds>` - Timeout per step (default: 30)
- `--debug` - Enable debug mode

## Examples

### Run Analysis Pipeline
```bash
rufflo stream-chain pipeline analysis
```

### Refactor with Extended Timeout
```bash
rufflo stream-chain pipeline refactor --timeout 60
```

### Verbose Test Generation
```bash
rufflo stream-chain pipeline test --verbose
```

### Performance Optimization
```bash
rufflo stream-chain pipeline optimize --debug
```

## Output

Each pipeline generates:
- Step-by-step execution progress
- Success/failure status per step
- Total execution time
- Summary of results

## Custom Pipelines

Define custom pipelines in `.rufflo/config.json`:

```json
{
  "streamChain": {
    "pipelines": {
      "security": {
        "name": "Security Audit Pipeline",
        "prompts": [
          "Scan for security vulnerabilities",
          "Prioritize by severity",
          "Generate fixes"
        ]
      }
    }
  }
}
```

Then run:
```bash
rufflo stream-chain pipeline security
```