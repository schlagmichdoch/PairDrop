#!/bin/bash

# edit this to point to the pairdrop-cli executable
pathToPairDropCli="/usr/local/bin/pairdrop-cli/pairdrop"

# Initialize an array
lines=()

# Read each line into the array
while IFS= read -r line; do
    lines+=("$line")
done <<< "$NAUTILUS_SCRIPT_SELECTED_FILE_PATHS"

# Get the length of the array
length=${#lines[@]}

# Remove the last entry
unset 'lines[length-1]'

$pathToPairDropCli "${lines[@]}"