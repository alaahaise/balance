#!/usr/bin/env bash
# Arrête le serveur jetable du test d'intégration et efface ses données.
set -u

T=$(cat /tmp/balance-it-dir 2>/dev/null || true)
[ -n "${T:-}" ] || { echo "Aucun serveur jetable enregistré"; exit 0; }

if [ -f "$T/m.pid" ]; then
  kill "$(cat "$T/m.pid")" 2>/dev/null || true
fi
pkill -f "datadir=$T/data" 2>/dev/null || true
sleep 2
rm -rf "$T" /tmp/balance-it-dir
echo "Serveur jetable arrêté et supprimé"
