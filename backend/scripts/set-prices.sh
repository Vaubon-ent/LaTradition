#!/usr/bin/env bash
set -euo pipefail

BASE="https://bigbertha.tail6f4387.ts.net"
JAR=$(mktemp)
PASSWORD="REMPLACE_MOI"   # mot de passe admin réel

echo "== Login =="
curl -s -c "$JAR" -X POST "$BASE/api/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$PASSWORD\"}"
echo

for pair in "blanc:1400" "noir:1400" "blanc_morue:1700"; do
  id="${pair%%:*}"
  cents="${pair##*:}"
  echo "== PUT $id -> $cents centimes =="
  curl -s -b "$JAR" -X PUT "$BASE/api/admin/products/$id" \
    -H "Content-Type: application/json" \
    -d "{\"price_per_kg\":$cents,\"active\":true}"
  echo
done

echo "== Vérification =="
curl -s "$BASE/api/products"
echo

rm -f "$JAR"
