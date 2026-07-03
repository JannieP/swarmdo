#!/bin/bash
# Security Audit - Full Scan Script
# Run comprehensive security scan pipeline

set -e

echo "Running full security scan..."

# Input validation
echo "Checking input validation..."
npx @swarmdo/cli security scan --check input-validation

# Path traversal
echo "Checking path traversal..."
npx @swarmdo/cli security scan --check path-traversal

# SQL injection
echo "Checking SQL injection..."
npx @swarmdo/cli security scan --check sql-injection

# XSS
echo "Checking XSS..."
npx @swarmdo/cli security scan --check xss

# Secrets
echo "Checking for hardcoded secrets..."
npx @swarmdo/cli security validate --check secrets

# CVE scan
echo "Scanning dependencies for CVEs..."
npx @swarmdo/cli security cve --scan

echo "Security scan complete"
