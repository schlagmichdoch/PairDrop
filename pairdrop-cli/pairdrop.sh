#!/bin/bash
parent_path=$( cd "$(dirname "${BASH_SOURCE[0]}")" || exit ; pwd -P )

cd "$parent_path" || exit

./pairdrop "$@"